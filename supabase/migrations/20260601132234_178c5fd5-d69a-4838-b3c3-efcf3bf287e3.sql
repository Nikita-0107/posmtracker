
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
  dates date[];
  first_d date;
  d date;
  active_count int;
  cur_streak int := 0;
  long_streak int := 0;
  run int := 0;
  qualified boolean;
  today_qualified boolean := false;
  today_active boolean := false;
  active_last7 int := 0;
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

  first_d := dates[1];
  d := first_d;

  WHILE d <= today_d LOOP
    SELECT COUNT(*) INTO active_count
      FROM unnest(dates) AS u(ad)
      WHERE ad BETWEEN d - 6 AND d;
    qualified := active_count >= 4;
    IF qualified THEN
      run := run + 1;
      IF run > long_streak THEN long_streak := run; END IF;
    ELSE
      run := 0;
    END IF;
    IF d = today_d THEN
      today_qualified := qualified;
      cur_streak := run;
    END IF;
    d := d + 1;
  END LOOP;

  today_active := today_d = ANY(dates);

  SELECT COUNT(*) INTO active_last7
    FROM unnest(dates) AS u(ad)
    WHERE ad BETWEEN today_d - 6 AND today_d;

  at_risk := today_qualified AND active_last7 = 4 AND NOT today_active;

  RETURN jsonb_build_object(
    'current_streak', cur_streak,
    'longest_streak', long_streak,
    'at_risk', at_risk,
    'active_today', today_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tl_streak(uuid) TO authenticated;
