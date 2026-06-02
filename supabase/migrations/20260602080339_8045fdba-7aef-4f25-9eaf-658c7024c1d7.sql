
-- Update TL streak: Mon-Sun weeks, 3-day weekly qualification threshold (hidden),
-- and the current (in-progress) week always contributes its distinct activity-day
-- count to the displayed streak so any meaningful activity is immediately visible.

CREATE OR REPLACE FUNCTION public._compute_streak_from_dates(_dates date[], _today date)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cur_week_start date;
  weeks int := 0;
  cur_days int := 0;
  cnt int;
  w date;
BEGIN
  IF _dates IS NULL OR array_length(_dates, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Monday of current week (ISO: Monday = 1)
  cur_week_start := _today - ((EXTRACT(ISODOW FROM _today)::int) - 1);

  -- Distinct activity days in the current (in-progress) week.
  -- This always contributes to the displayed streak so any meaningful
  -- activity in the current week shows up immediately as 🔥 N.
  SELECT COUNT(DISTINCT ad) INTO cur_days
  FROM unnest(_dates) u(ad)
  WHERE ad >= cur_week_start AND ad <= cur_week_start + 6;

  -- Walk backward through completed prior weeks while each one qualifies
  -- (>= 3 distinct activity days Mon-Sun).
  w := cur_week_start - 7;
  LOOP
    SELECT COUNT(DISTINCT ad) INTO cnt
    FROM unnest(_dates) u(ad)
    WHERE ad >= w AND ad <= w + 6;
    IF cnt >= 3 THEN
      weeks := weeks + 1;
      w := w - 7;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- Total streak in days = prior qualifying weeks (7 days each) +
  -- distinct activity days completed so far in the current week.
  RETURN weeks * 7 + cur_days;
END $$;

REVOKE EXECUTE ON FUNCTION public._compute_streak_from_dates(date[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._compute_streak_from_dates(date[], date) TO authenticated, service_role;

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
  cur_week_start date;
  self_dates date[];
  self_streak int := 0;
  cur_week_days int := 0;
  prior_weeks_streak int := 0;
  active_today boolean := false;
  at_risk boolean := false;
  champ_name text := NULL;
  champ_wd text := NULL;
  champ_streak int := 0;
  rec record;
  s int;
  d date[];
BEGIN
  cur_week_start := today_d - ((EXTRACT(ISODOW FROM today_d)::int) - 1);

  self_dates := ARRAY(SELECT public._tl_activity_dates(_wd_tl_id));
  self_streak := public._compute_streak_from_dates(self_dates, today_d);

  IF self_dates IS NOT NULL AND array_length(self_dates, 1) IS NOT NULL THEN
    SELECT COUNT(DISTINCT ad) INTO cur_week_days
      FROM unnest(self_dates) u(ad)
      WHERE ad >= cur_week_start AND ad <= cur_week_start + 6;
    SELECT EXISTS (SELECT 1 FROM unnest(self_dates) u(ad) WHERE ad = today_d)
      INTO active_today;
  END IF;

  prior_weeks_streak := self_streak - cur_week_days;

  -- At risk: a streak exists from prior weeks but the current week has not
  -- yet hit the (hidden) 3-day qualification threshold.
  at_risk := (prior_weeks_streak > 0) AND (cur_week_days < 3);

  -- Champion: TL with the highest current active streak app-wide.
  FOR rec IN
    SELECT DISTINCT t.id, t.tl_name, t.wd_code
    FROM public.wd_tls t
    WHERE t.user_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public._tl_activity_dates(t.id) ad
        WHERE ad >= today_d - 21
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
