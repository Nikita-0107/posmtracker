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
  -- Monday of current ISO week
  cur_week_start date := today_d - ((EXTRACT(ISODOW FROM today_d)::int) - 1);
  cur_week_end date := cur_week_start + 6;
  dates date[];
  first_week_start date;
  w date;
  active_count int;
  cur_streak int := 0;
  long_streak int := 0;
  run int := 0;
  qualified boolean;
  today_active boolean := false;
  cur_week_active int := 0;
  days_left_incl_today int;
  at_risk boolean := false;
BEGIN
  SELECT array_agg(DISTINCT ad ORDER BY ad)
  INTO dates
  FROM (
    SELECT (created_at AT TIME ZONE tz)::date AS ad
      FROM public.tl_issuances WHERE wd_tl_id = _wd_tl_id
    UNION
    SELECT (created_at AT TIME ZONE tz)::date AS ad
      FROM public.tl_usages WHERE wd_tl_id = _wd_tl_id
    UNION
    SELECT (created_at AT TIME ZONE tz)::date AS ad
      FROM public.tl_returns WHERE wd_tl_id = _wd_tl_id
  ) x;

  IF dates IS NULL OR array_length(dates, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'current_streak', 0,
      'longest_streak', 0,
      'at_risk', false,
      'active_today', false
    );
  END IF;

  first_week_start := dates[1] - ((EXTRACT(ISODOW FROM dates[1])::int) - 1);
  w := first_week_start;

  WHILE w <= cur_week_start LOOP
    SELECT COUNT(*) INTO active_count
      FROM unnest(dates) AS u(ad)
      WHERE ad BETWEEN w AND w + 6;
    qualified := active_count >= 4;
    IF qualified THEN
      run := run + 1;
      IF run > long_streak THEN long_streak := run; END IF;
    ELSE
      -- Don't break the run on the current (in-progress) week if it's still achievable
      IF w = cur_week_start THEN
        NULL; -- handled below
      ELSE
        run := 0;
      END IF;
    END IF;
    IF w = cur_week_start THEN
      cur_week_active := active_count;
      cur_streak := run;
    END IF;
    w := w + 7;
  END LOOP;

  today_active := today_d = ANY(dates);
  days_left_incl_today := (cur_week_end - today_d) + 1;
  at_risk := cur_week_active < 4 AND cur_streak >= 0
             AND (cur_week_active + days_left_incl_today) >= 4
             AND days_left_incl_today <= (4 - cur_week_active)
             AND NOT today_active;

  RETURN jsonb_build_object(
    'current_streak', cur_streak,
    'longest_streak', long_streak,
    'at_risk', at_risk,
    'active_today', today_active
  );
END;
$$;