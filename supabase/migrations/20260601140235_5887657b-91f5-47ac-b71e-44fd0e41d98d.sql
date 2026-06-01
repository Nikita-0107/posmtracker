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
  cur_week_start date := today_d - ((EXTRACT(ISODOW FROM today_d)::int) - 1);
  cur_week_end date := cur_week_start + 6;
  tl_user uuid;
  tl_wd text;
  dates date[];
  first_week_start date;
  w date;
  active_count int;
  cur_week_active int := 0;
  cur_week_first_active date;
  run_start date := NULL;
  cur_streak int := 0;
  long_streak int := 0;
  today_active boolean := false;
  days_available int;
  missing_days int;
  max_possible_active int;
  at_risk boolean := false;
BEGIN
  SELECT user_id, wd_code
  INTO tl_user, tl_wd
  FROM public.wd_tls
  WHERE id = _wd_tl_id;

  SELECT array_agg(DISTINCT ad ORDER BY ad)
  INTO dates
  FROM (
    SELECT (created_at AT TIME ZONE tz)::date AS ad
      FROM public.tl_issuances
      WHERE wd_tl_id = _wd_tl_id
    UNION
    SELECT (created_at AT TIME ZONE tz)::date AS ad
      FROM public.tl_usages
      WHERE wd_tl_id = _wd_tl_id
    UNION
    SELECT (created_at AT TIME ZONE tz)::date AS ad
      FROM public.tl_returns
      WHERE wd_tl_id = _wd_tl_id
    UNION
    SELECT (created_at AT TIME ZONE tz)::date AS ad
      FROM public.tl_uploads
      WHERE tl_user IS NOT NULL AND performed_by = tl_user
    UNION
    SELECT (created_at AT TIME ZONE tz)::date AS ad
      FROM public.stock_movements
      WHERE tl_user IS NOT NULL
        AND (performed_by = tl_user OR confirmed_by = tl_user)
    UNION
    SELECT (snapshot_date)::date AS ad
      FROM public.wd_stock_snapshots
      WHERE tl_user IS NOT NULL
        AND created_by = tl_user
        AND (tl_wd IS NULL OR wd_code = tl_wd)
    UNION
    SELECT (uploaded_at AT TIME ZONE tz)::date AS ad
      FROM public.wd_brand_images
      WHERE tl_user IS NOT NULL
        AND uploaded_by = tl_user
        AND (tl_wd IS NULL OR wd_code = tl_wd)
  ) x
  WHERE ad IS NOT NULL;

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

  WHILE w < cur_week_start LOOP
    SELECT COUNT(*) INTO active_count
      FROM unnest(dates) AS u(ad)
      WHERE ad BETWEEN w AND w + 6;

    IF active_count >= 4 THEN
      IF run_start IS NULL THEN
        run_start := w;
      END IF;
      long_streak := GREATEST(long_streak, ((w + 6) - run_start + 1)::int);
    ELSE
      run_start := NULL;
    END IF;

    w := w + 7;
  END LOOP;

  SELECT COUNT(*), MIN(ad)
  INTO cur_week_active, cur_week_first_active
  FROM unnest(dates) AS u(ad)
  WHERE ad BETWEEN cur_week_start AND cur_week_end;

  today_active := today_d = ANY(dates);
  days_available := (cur_week_end - today_d)::int + CASE WHEN today_active THEN 0 ELSE 1 END;
  missing_days := GREATEST(0, 4 - cur_week_active);
  max_possible_active := cur_week_active + days_available;

  IF cur_week_active >= 4 THEN
    IF run_start IS NULL THEN
      run_start := cur_week_start;
    END IF;
    cur_streak := (today_d - run_start + 1)::int;
  ELSIF max_possible_active >= 4 THEN
    IF run_start IS NOT NULL THEN
      cur_streak := (today_d - run_start + 1)::int;
    ELSIF cur_week_first_active IS NOT NULL THEN
      cur_streak := (today_d - cur_week_first_active + 1)::int;
    END IF;
  ELSE
    cur_streak := 0;
  END IF;

  long_streak := GREATEST(long_streak, cur_streak);
  at_risk := cur_streak > 0
             AND cur_week_active < 4
             AND max_possible_active >= 4
             AND days_available <= missing_days
             AND NOT today_active;

  RETURN jsonb_build_object(
    'current_streak', cur_streak,
    'longest_streak', long_streak,
    'at_risk', at_risk,
    'active_today', today_active
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tl_streak(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tl_streak(uuid) TO authenticated, service_role;