CREATE OR REPLACE FUNCTION public.get_ae_tl_team_report(
  _ae_id text,
  _inactivity_days int DEFAULT 7
)
RETURNS TABLE (
  wd_code text,
  wd_name text,
  tl_id text,
  tl_name text,
  is_wd_receiver boolean,
  status text,
  last_activity date,
  current_streak int,
  tl_stock_units int,
  material_types int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  tz text := 'Asia/Kolkata';
  today_d date := (now() AT TIME ZONE tz)::date;
  caller_ae text;
  is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
BEGIN
  IF NOT is_admin THEN
    SELECT p.ae_id INTO caller_ae FROM public.profiles p WHERE p.id = auth.uid();
    IF caller_ae IS NULL OR caller_ae <> _ae_id THEN
      RAISE EXCEPTION 'Forbidden: not your AE';
    END IF;
  END IF;

  RETURN QUERY
  WITH wds AS (
    SELECT
      hw.wd_code AS wds_wd_code,
      hw.wd_name AS wds_wd_name
    FROM public.hierarchy_wd hw
    WHERE hw.ae_id = _ae_id
  ),
  htl AS (
    SELECT DISTINCT ON (ht.wd_code, ht.tl_id)
      ht.wd_code AS htl_wd_code,
      ht.tl_id AS htl_tl_id,
      ht.tl_name AS htl_tl_name,
      ht.is_wd_receiver AS htl_is_wd_receiver
    FROM public.hierarchy_tl ht
    JOIN wds wd_scope ON wd_scope.wds_wd_code = ht.wd_code
    ORDER BY ht.wd_code, ht.tl_id, ht.is_wd_receiver DESC NULLS LAST, ht.tl_name
  ),
  wdtl_match AS (
    SELECT
      htl.htl_wd_code AS match_wd_code,
      htl.htl_tl_id AS match_tl_id,
      wt.id AS match_wd_tl_id
    FROM htl
    JOIN public.wd_tls wt
      ON wt.wd_code = htl.htl_wd_code
     AND upper(btrim(wt.tl_name)) = upper(btrim(htl.htl_tl_name))
  ),
  dates AS (
    SELECT
      wm.match_wd_code AS dates_wd_code,
      wm.match_tl_id AS dates_tl_id,
      ARRAY(
        SELECT DISTINCT activity_day
        FROM (
          SELECT unnest(ARRAY(SELECT public._tl_activity_dates(wm2.match_wd_tl_id))) AS activity_day
          FROM wdtl_match wm2
          WHERE wm2.match_wd_code = wm.match_wd_code
            AND wm2.match_tl_id = wm.match_tl_id
        ) activity_source
        WHERE activity_day IS NOT NULL
      ) AS activity_dates
    FROM wdtl_match wm
    GROUP BY wm.match_wd_code, wm.match_tl_id
  ),
  issued AS (
    SELECT
      wm.match_wd_code AS issued_wd_code,
      wm.match_tl_id AS issued_tl_id,
      tii.material_code AS issued_material_code,
      SUM(tii.qty_issued)::int AS issued_qty
    FROM public.tl_issuances ti
    JOIN public.tl_issuance_items tii ON tii.issuance_id = ti.id
    JOIN wdtl_match wm ON wm.match_wd_tl_id = ti.wd_tl_id
    GROUP BY wm.match_wd_code, wm.match_tl_id, tii.material_code
  ),
  used AS (
    SELECT
      wm.match_wd_code AS used_wd_code,
      wm.match_tl_id AS used_tl_id,
      tii.material_code AS used_material_code,
      SUM(tii.qty_used)::int AS used_qty
    FROM public.tl_issuances ti
    JOIN public.tl_issuance_items tii ON tii.issuance_id = ti.id
    JOIN wdtl_match wm ON wm.match_wd_tl_id = ti.wd_tl_id
    GROUP BY wm.match_wd_code, wm.match_tl_id, tii.material_code
  ),
  returned AS (
    SELECT
      wm.match_wd_code AS returned_wd_code,
      wm.match_tl_id AS returned_tl_id,
      tr.material_code AS returned_material_code,
      SUM(tr.qty)::int AS returned_qty
    FROM public.tl_returns tr
    JOIN wdtl_match wm ON wm.match_wd_tl_id = tr.wd_tl_id
    GROUP BY wm.match_wd_code, wm.match_tl_id, tr.material_code
  ),
  bal_keys AS (
    SELECT
      issued.issued_wd_code AS key_wd_code,
      issued.issued_tl_id AS key_tl_id,
      issued.issued_material_code AS key_material_code
    FROM issued
    UNION
    SELECT
      returned.returned_wd_code AS key_wd_code,
      returned.returned_tl_id AS key_tl_id,
      returned.returned_material_code AS key_material_code
    FROM returned
  ),
  bal AS (
    SELECT
      bk.key_wd_code AS bal_wd_code,
      bk.key_tl_id AS bal_tl_id,
      bk.key_material_code AS bal_material_code,
      COALESCE(i.issued_qty, 0) - COALESCE(u.used_qty, 0) - COALESCE(r.returned_qty, 0) AS bal_qty
    FROM bal_keys bk
    LEFT JOIN issued i
      ON i.issued_wd_code = bk.key_wd_code
     AND i.issued_tl_id = bk.key_tl_id
     AND i.issued_material_code = bk.key_material_code
    LEFT JOIN used u
      ON u.used_wd_code = bk.key_wd_code
     AND u.used_tl_id = bk.key_tl_id
     AND u.used_material_code = bk.key_material_code
    LEFT JOIN returned r
      ON r.returned_wd_code = bk.key_wd_code
     AND r.returned_tl_id = bk.key_tl_id
     AND r.returned_material_code = bk.key_material_code
  ),
  bal_agg AS (
    SELECT
      bal.bal_wd_code AS agg_wd_code,
      bal.bal_tl_id AS agg_tl_id,
      SUM(GREATEST(bal.bal_qty, 0))::int AS agg_stock_units,
      COUNT(*) FILTER (WHERE bal.bal_qty > 0)::int AS agg_material_types
    FROM bal
    GROUP BY bal.bal_wd_code, bal.bal_tl_id
  )
  SELECT
    htl.htl_wd_code::text AS wd_code,
    wds.wds_wd_name::text AS wd_name,
    htl.htl_tl_id::text AS tl_id,
    htl.htl_tl_name::text AS tl_name,
    htl.htl_is_wd_receiver AS is_wd_receiver,
    (CASE
      WHEN d.activity_dates IS NULL OR array_length(d.activity_dates, 1) IS NULL THEN 'Inactive'
      WHEN (SELECT max(activity_day) FROM unnest(d.activity_dates) activity_day) >= today_d - _inactivity_days THEN 'Active'
      ELSE 'Inactive'
    END)::text AS status,
    (SELECT max(activity_day) FROM unnest(d.activity_dates) activity_day)::date AS last_activity,
    COALESCE(public._compute_streak_from_dates(d.activity_dates, today_d), 0)::int AS current_streak,
    COALESCE(ba.agg_stock_units, 0)::int AS tl_stock_units,
    COALESCE(ba.agg_material_types, 0)::int AS material_types
  FROM htl
  JOIN wds ON wds.wds_wd_code = htl.htl_wd_code
  LEFT JOIN dates d
    ON d.dates_wd_code = htl.htl_wd_code
   AND d.dates_tl_id = htl.htl_tl_id
  LEFT JOIN bal_agg ba
    ON ba.agg_wd_code = htl.htl_wd_code
   AND ba.agg_tl_id = htl.htl_tl_id
  ORDER BY htl.htl_wd_code, htl.htl_is_wd_receiver DESC, htl.htl_tl_name;
END $$;

GRANT EXECUTE ON FUNCTION public.get_ae_tl_team_report(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ae_tl_team_report(text, int) TO service_role;