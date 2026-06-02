CREATE OR REPLACE FUNCTION public.get_tl_activity_report(_inactivity_days int DEFAULT 7)
RETURNS TABLE (
  ae_id text, ae_name text, wd_code text, wd_name text,
  tl_id text, tl_name text, status text,
  last_activity date, current_streak int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  tz text := 'Asia/Kolkata';
  today_d date := (now() AT TIME ZONE tz)::date;
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
    COALESCE(public._compute_streak_from_dates(td.dates, today_d), 0) AS current_streak
  FROM public.hierarchy_tl h
  LEFT JOIN tl_dates td ON td.tl_id = h.tl_id
  LEFT JOIN public.hierarchy_wd w ON w.wd_code = h.wd_code
  LEFT JOIN public.hierarchy_ae ae ON ae.ae_id = w.ae_id
  ORDER BY w.ae_id NULLS LAST, h.wd_code, h.tl_name;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_tl_activity_report(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tl_activity_report(int) TO service_role;