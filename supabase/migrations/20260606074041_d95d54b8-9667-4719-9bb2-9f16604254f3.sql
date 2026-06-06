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
    SELECT w.wd_code, w.wd_name FROM public.hierarchy_wd w WHERE w.ae_id = _ae_id
  ),
  htl AS (
    -- Dedupe hierarchy_tl rows per (wd_code, tl_id)
    SELECT DISTINCT ON (h.wd_code, h.tl_id)
           h.wd_code, h.tl_id, h.tl_name, h.is_wd_receiver
    FROM public.hierarchy_tl h
    JOIN wds ON wds.wd_code = h.wd_code
    ORDER BY h.wd_code, h.tl_id, h.is_wd_receiver DESC NULLS LAST, h.tl_name
  ),
  wdtl_match AS (
    -- All wd_tls matches for each hierarchy TL (may be multiple due to name casing)
    SELECT htl.wd_code, htl.tl_id, t.id AS wd_tl_id
    FROM htl
    JOIN public.wd_tls t
      ON t.wd_code = htl.wd_code
     AND upper(btrim(t.tl_name)) = upper(btrim(htl.tl_name))
  ),
  dates AS (
    SELECT m.wd_code, m.tl_id,
           ARRAY(
             SELECT DISTINCT d FROM (
               SELECT unnest(ARRAY(SELECT public._tl_activity_dates(m2.wd_tl_id))) AS d
               FROM wdtl_match m2
               WHERE m2.wd_code = m.wd_code AND m2.tl_id = m.tl_id
             ) s WHERE d IS NOT NULL
           ) AS d
    FROM wdtl_match m
    GROUP BY m.wd_code, m.tl_id
  ),
  issued AS (
    SELECT m.wd_code, m.tl_id, it.material_code, SUM(it.qty_issued)::int AS qty
    FROM public.tl_issuances i
    JOIN public.tl_issuance_items it ON it.issuance_id = i.id
    JOIN wdtl_match m ON m.wd_tl_id = i.wd_tl_id
    GROUP BY m.wd_code, m.tl_id, it.material_code
  ),
  used AS (
    SELECT m.wd_code, m.tl_id, it.material_code, SUM(it.qty_used)::int AS qty
    FROM public.tl_issuances i
    JOIN public.tl_issuance_items it ON it.issuance_id = i.id
    JOIN wdtl_match m ON m.wd_tl_id = i.wd_tl_id
    GROUP BY m.wd_code, m.tl_id, it.material_code
  ),
  returned AS (
    SELECT m.wd_code, m.tl_id, r.material_code, SUM(r.qty)::int AS qty
    FROM public.tl_returns r
    JOIN wdtl_match m ON m.wd_tl_id = r.wd_tl_id
    GROUP BY m.wd_code, m.tl_id, r.material_code
  ),
  bal AS (
    SELECT k.wd_code, k.tl_id, k.material_code,
           COALESCE(i.qty,0) - COALESCE(u.qty,0) - COALESCE(rt.qty,0) AS qty
    FROM (
      SELECT wd_code, tl_id, material_code FROM issued
      UNION
      SELECT wd_code, tl_id, material_code FROM returned
    ) k
    LEFT JOIN issued i    ON i.wd_code=k.wd_code AND i.tl_id=k.tl_id AND i.material_code=k.material_code
    LEFT JOIN used   u    ON u.wd_code=k.wd_code AND u.tl_id=k.tl_id AND u.material_code=k.material_code
    LEFT JOIN returned rt ON rt.wd_code=k.wd_code AND rt.tl_id=k.tl_id AND rt.material_code=k.material_code
  ),
  bal_agg AS (
    SELECT wd_code, tl_id,
           SUM(GREATEST(qty,0))::int AS stock_units,
           COUNT(*) FILTER (WHERE qty > 0)::int AS material_types
    FROM bal
    GROUP BY wd_code, tl_id
  )
  SELECT
    htl.wd_code,
    w.wd_name,
    htl.tl_id,
    htl.tl_name,
    htl.is_wd_receiver,
    CASE
      WHEN d.d IS NULL OR array_length(d.d, 1) IS NULL THEN 'Inactive'
      WHEN (SELECT max(x) FROM unnest(d.d) x) >= today_d - _inactivity_days THEN 'Active'
      ELSE 'Inactive'
    END AS status,
    (SELECT max(x) FROM unnest(d.d) x) AS last_activity,
    COALESCE(public._compute_streak_from_dates(d.d, today_d), 0) AS current_streak,
    COALESCE(b.stock_units, 0) AS tl_stock_units,
    COALESCE(b.material_types, 0) AS material_types
  FROM htl
  JOIN wds w ON w.wd_code = htl.wd_code
  LEFT JOIN dates d   ON d.wd_code = htl.wd_code AND d.tl_id = htl.tl_id
  LEFT JOIN bal_agg b ON b.wd_code = htl.wd_code AND b.tl_id = htl.tl_id
  ORDER BY htl.wd_code,
           htl.is_wd_receiver DESC,
           htl.tl_name;
END $$;