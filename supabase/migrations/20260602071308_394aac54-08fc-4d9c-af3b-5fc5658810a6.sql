
-- Helper: per-TL activity dates (meaningful actions only)
CREATE OR REPLACE FUNCTION public._tl_activity_dates(_wd_tl_id uuid)
RETURNS SETOF date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tl AS (
    SELECT user_id, wd_code FROM public.wd_tls WHERE id = _wd_tl_id
  )
  SELECT DISTINCT ad FROM (
    SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS ad
      FROM public.tl_issuances WHERE wd_tl_id = _wd_tl_id
    UNION
    SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date
      FROM public.tl_usages WHERE wd_tl_id = _wd_tl_id
    UNION
    SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date
      FROM public.tl_returns WHERE wd_tl_id = _wd_tl_id
    UNION
    SELECT (u.created_at AT TIME ZONE 'Asia/Kolkata')::date
      FROM public.tl_uploads u, tl
      WHERE tl.user_id IS NOT NULL AND u.performed_by = tl.user_id
    UNION
    SELECT (m.created_at AT TIME ZONE 'Asia/Kolkata')::date
      FROM public.stock_movements m, tl
      WHERE tl.user_id IS NOT NULL
        AND (m.performed_by = tl.user_id OR m.confirmed_by = tl.user_id)
    UNION
    SELECT s.snapshot_date
      FROM public.wd_stock_snapshots s, tl
      WHERE tl.user_id IS NOT NULL AND s.created_by = tl.user_id
        AND (tl.wd_code IS NULL OR s.wd_code = tl.wd_code)
    UNION
    SELECT (b.uploaded_at AT TIME ZONE 'Asia/Kolkata')::date
      FROM public.wd_brand_images b, tl
      WHERE tl.user_id IS NOT NULL AND b.uploaded_by = tl.user_id
        AND (tl.wd_code IS NULL OR b.wd_code = tl.wd_code)
  ) x WHERE ad IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public._tl_activity_dates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._tl_activity_dates(uuid) TO authenticated, service_role;

-- Helper: compute consecutive-days streak given a set of activity dates.
-- Rule: a day D "qualifies" when there are >= 4 distinct activity days in [D-6, D].
-- streak = number of consecutive qualifying days ending today (or yesterday if
-- today not yet qualifying — so users don't lose the streak mid-day).
CREATE OR REPLACE FUNCTION public._compute_streak_from_dates(_dates date[], _today date)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d date;
  streak int := 0;
  cnt int;
  today_qual boolean;
BEGIN
  IF _dates IS NULL OR array_length(_dates, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) >= 4 INTO today_qual
  FROM unnest(_dates) u(ad)
  WHERE ad BETWEEN _today - 6 AND _today;

  d := CASE WHEN today_qual THEN _today ELSE _today - 1 END;

  LOOP
    SELECT COUNT(*) INTO cnt
    FROM unnest(_dates) u(ad)
    WHERE ad BETWEEN d - 6 AND d;
    IF cnt >= 4 THEN
      streak := streak + 1;
      d := d - 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN streak;
END $$;

REVOKE EXECUTE ON FUNCTION public._compute_streak_from_dates(date[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._compute_streak_from_dates(date[], date) TO authenticated, service_role;

-- Main: returns current streak + status + current champion (the TL with the
-- highest active streak right now across the whole app).
CREATE OR REPLACE FUNCTION public.get_tl_streak(_wd_tl_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz text := 'Asia/Kolkata';
  today_d date := (now() AT TIME ZONE tz)::date;
  self_dates date[];
  self_streak int := 0;
  today_qual boolean := false;
  active_today boolean := false;
  at_risk boolean := false;
  champ_name text := NULL;
  champ_wd text := NULL;
  champ_streak int := 0;
  rec record;
  s int;
  d date[];
BEGIN
  -- Self
  self_dates := ARRAY(SELECT public._tl_activity_dates(_wd_tl_id));
  self_streak := public._compute_streak_from_dates(self_dates, today_d);

  IF self_dates IS NOT NULL AND array_length(self_dates, 1) IS NOT NULL THEN
    SELECT COUNT(*) >= 4 INTO today_qual
      FROM unnest(self_dates) u(ad)
      WHERE ad BETWEEN today_d - 6 AND today_d;
    SELECT EXISTS (SELECT 1 FROM unnest(self_dates) u(ad) WHERE ad = today_d)
      INTO active_today;
  END IF;

  at_risk := (self_streak > 0) AND NOT today_qual;

  -- Champion: TL with the highest current active streak app-wide.
  -- Restrict candidates to TLs with any activity in the last 14 days
  -- (anyone else cannot have an active streak today).
  FOR rec IN
    SELECT DISTINCT t.id, t.tl_name, t.wd_code
    FROM public.wd_tls t
    WHERE t.user_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public._tl_activity_dates(t.id) ad
        WHERE ad >= today_d - 14
      )
  LOOP
    d := ARRAY(SELECT public._tl_activity_dates(rec.id));
    s := public._compute_streak_from_dates(d, today_d);
    IF s > champ_streak THEN
      champ_streak := s;
      champ_name := rec.tl_name;
      champ_wd := rec.wd_code;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'current_streak', self_streak,
    'at_risk', at_risk,
    'active_today', active_today,
    'champion_name', champ_name,
    'champion_wd', champ_wd,
    'champion_streak', champ_streak
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_tl_streak(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tl_streak(uuid) TO authenticated, service_role;
