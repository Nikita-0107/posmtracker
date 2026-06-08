
DROP FUNCTION IF EXISTS public.get_tl_activity_report(integer);
DROP FUNCTION IF EXISTS public.get_ae_tl_team_report(text, integer);

CREATE FUNCTION public.get_tl_activity_report(_inactivity_days integer DEFAULT 7)
RETURNS TABLE(
  ae_id text, ae_name text, wd_code text, wd_name text,
  tl_id text, tl_name text, status text, last_activity date,
  current_streak integer, total_active_days integer, active_days_this_month integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  tz text := 'Asia/Kolkata';
  today_d date := (now() AT TIME ZONE tz)::date;
  month_start date := date_trunc('month', (now() AT TIME ZONE tz)::date)::date;
BEGIN
  RETURN QUERY
  WITH tl_dates AS (
    SELECT h.tl_id, h.tl_name, h.wd_code, t.id AS wd_tl_id,
           ARRAY(SELECT public._tl_activity_dates(t.id)) AS dates
    FROM public.hierarchy_tl h
    LEFT JOIN public.wd_tls t ON t.wd_code = h.wd_code AND t.tl_name = h.tl_name
  )
  SELECT w.ae_id, ae.ae_name, h.wd_code, w.wd_name, h.tl_id, h.tl_name,
    CASE
      WHEN td.dates IS NULL OR array_length(td.dates, 1) IS NULL THEN 'Inactive'
      WHEN (SELECT max(d) FROM unnest(td.dates) d) >= today_d - _inactivity_days THEN 'Active'
      ELSE 'Inactive'
    END AS status,
    (SELECT max(d) FROM unnest(td.dates) d) AS last_activity,
    COALESCE(public._compute_streak_from_dates(td.dates, today_d), 0) AS current_streak,
    COALESCE((SELECT count(DISTINCT d) FROM unnest(td.dates) d), 0)::int AS total_active_days,
    COALESCE((SELECT count(DISTINCT d) FROM unnest(td.dates) d WHERE d >= month_start), 0)::int AS active_days_this_month
  FROM public.hierarchy_tl h
  LEFT JOIN tl_dates td ON td.tl_id = h.tl_id
  LEFT JOIN public.hierarchy_wd w ON w.wd_code = h.wd_code
  LEFT JOIN public.hierarchy_ae ae ON ae.ae_id = w.ae_id
  ORDER BY w.ae_id NULLS LAST, h.wd_code, h.tl_name;
END $function$;

CREATE FUNCTION public.get_ae_tl_team_report(_ae_id text, _inactivity_days integer DEFAULT 7)
RETURNS TABLE(
  wd_code text, wd_name text, tl_id text, tl_name text, is_wd_receiver boolean,
  status text, last_activity date, current_streak integer,
  total_active_days integer, active_days_this_month integer,
  tl_stock_units integer, material_types integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  tz text := 'Asia/Kolkata';
  today_d date := (now() AT TIME ZONE tz)::date;
  month_start date := date_trunc('month', (now() AT TIME ZONE tz)::date)::date;
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
    SELECT hw.wd_code AS wds_wd_code, hw.wd_name AS wds_wd_name
    FROM public.hierarchy_wd hw WHERE hw.ae_id = _ae_id
  ),
  htl AS (
    SELECT DISTINCT ON (ht.wd_code, ht.tl_id)
      ht.wd_code AS htl_wd_code, ht.tl_id AS htl_tl_id,
      ht.tl_name AS htl_tl_name, ht.is_wd_receiver AS htl_is_wd_receiver
    FROM public.hierarchy_tl ht
    JOIN wds ON wds.wds_wd_code = ht.wd_code
    ORDER BY ht.wd_code, ht.tl_id, ht.is_wd_receiver DESC NULLS LAST
  ),
  wdtl_match AS (
    SELECT h.htl_wd_code AS match_wd_code, h.htl_tl_id AS match_tl_id,
           t.id AS match_wd_tl_id
    FROM htl h
    LEFT JOIN public.wd_tls t ON t.wd_code = h.htl_wd_code AND t.tl_name = h.htl_tl_name
  ),
  dates AS (
    SELECT wm.match_wd_code AS dates_wd_code, wm.match_tl_id AS dates_tl_id,
      ARRAY(
        SELECT DISTINCT activity_day FROM (
          SELECT unnest(ARRAY(SELECT public._tl_activity_dates(wm2.match_wd_tl_id))) AS activity_day
          FROM wdtl_match wm2
          WHERE wm2.match_wd_code = wm.match_wd_code AND wm2.match_tl_id = wm.match_tl_id
        ) s WHERE activity_day IS NOT NULL
      ) AS activity_dates
    FROM wdtl_match wm
    GROUP BY wm.match_wd_code, wm.match_tl_id
  ),
  issued AS (
    SELECT wm.match_wd_code AS k_wd, wm.match_tl_id AS k_tl, tii.material_code AS k_mat,
           SUM(tii.qty_issued)::int AS issued_qty
    FROM public.tl_issuances ti
    JOIN public.tl_issuance_items tii ON tii.issuance_id = ti.id
    JOIN wdtl_match wm ON wm.match_wd_tl_id = ti.wd_tl_id
    GROUP BY wm.match_wd_code, wm.match_tl_id, tii.material_code
  ),
  used AS (
    SELECT wm.match_wd_code AS k_wd, wm.match_tl_id AS k_tl, tii.material_code AS k_mat,
           SUM(tii.qty_used)::int AS used_qty
    FROM public.tl_issuances ti
    JOIN public.tl_issuance_items tii ON tii.issuance_id = ti.id
    JOIN wdtl_match wm ON wm.match_wd_tl_id = ti.wd_tl_id
    GROUP BY wm.match_wd_code, wm.match_tl_id, tii.material_code
  ),
  returned AS (
    SELECT wm.match_wd_code AS k_wd, wm.match_tl_id AS k_tl, tr.material_code AS k_mat,
           SUM(tr.qty)::int AS returned_qty
    FROM public.tl_returns tr
    JOIN wdtl_match wm ON wm.match_wd_tl_id = tr.wd_tl_id
    GROUP BY wm.match_wd_code, wm.match_tl_id, tr.material_code
  ),
  bal_keys AS (
    SELECT k_wd, k_tl, k_mat FROM issued
    UNION SELECT k_wd, k_tl, k_mat FROM returned
  ),
  bal AS (
    SELECT bk.k_wd, bk.k_tl, bk.k_mat,
      COALESCE(i.issued_qty, 0) - COALESCE(u.used_qty, 0) - COALESCE(r.returned_qty, 0) AS bal_qty
    FROM bal_keys bk
    LEFT JOIN issued i ON i.k_wd=bk.k_wd AND i.k_tl=bk.k_tl AND i.k_mat=bk.k_mat
    LEFT JOIN used u ON u.k_wd=bk.k_wd AND u.k_tl=bk.k_tl AND u.k_mat=bk.k_mat
    LEFT JOIN returned r ON r.k_wd=bk.k_wd AND r.k_tl=bk.k_tl AND r.k_mat=bk.k_mat
  ),
  bal_agg AS (
    SELECT k_wd AS agg_wd_code, k_tl AS agg_tl_id,
      SUM(GREATEST(bal_qty, 0))::int AS agg_stock_units,
      COUNT(*) FILTER (WHERE bal_qty > 0)::int AS agg_material_types
    FROM bal GROUP BY k_wd, k_tl
  )
  SELECT
    htl.htl_wd_code::text, wds.wds_wd_name::text,
    htl.htl_tl_id::text, htl.htl_tl_name::text, htl.htl_is_wd_receiver,
    (CASE
      WHEN d.activity_dates IS NULL OR array_length(d.activity_dates, 1) IS NULL THEN 'Inactive'
      WHEN (SELECT max(a) FROM unnest(d.activity_dates) a) >= today_d - _inactivity_days THEN 'Active'
      ELSE 'Inactive'
    END)::text,
    (SELECT max(a) FROM unnest(d.activity_dates) a)::date,
    COALESCE(public._compute_streak_from_dates(d.activity_dates, today_d), 0)::int,
    COALESCE((SELECT count(DISTINCT a) FROM unnest(d.activity_dates) a), 0)::int,
    COALESCE((SELECT count(DISTINCT a) FROM unnest(d.activity_dates) a WHERE a >= month_start), 0)::int,
    COALESCE(ba.agg_stock_units, 0)::int,
    COALESCE(ba.agg_material_types, 0)::int
  FROM htl
  JOIN wds ON wds.wds_wd_code = htl.htl_wd_code
  LEFT JOIN dates d ON d.dates_wd_code = htl.htl_wd_code AND d.dates_tl_id = htl.htl_tl_id
  LEFT JOIN bal_agg ba ON ba.agg_wd_code = htl.htl_wd_code AND ba.agg_tl_id = htl.htl_tl_id
  ORDER BY htl.htl_wd_code, htl.htl_is_wd_receiver DESC, htl.htl_tl_name;
END $function$;
