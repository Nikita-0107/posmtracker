
CREATE OR REPLACE FUNCTION public._compute_streak_from_dates(_dates date[], _today date)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cur_week_start date;
  total_days int := 0;
  cur_days int := 0;
  cnt int;
  w date;
BEGIN
  IF _dates IS NULL OR array_length(_dates, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Monday of current week (ISO: Monday = 1)
  cur_week_start := _today - ((EXTRACT(ISODOW FROM _today)::int) - 1);

  -- Distinct activity days in the current (in-progress) week always
  -- contribute to the displayed streak.
  SELECT COUNT(DISTINCT ad) INTO cur_days
  FROM unnest(_dates) u(ad)
  WHERE ad >= cur_week_start AND ad <= cur_week_start + 6;

  total_days := cur_days;

  -- Walk backward through completed prior weeks. A week qualifies and
  -- continues the streak only when it has >= 3 distinct activity days
  -- (Mon-Sun). Each qualifying week contributes its ACTUAL distinct
  -- activity-day count (not 7), so streak <= total active days.
  w := cur_week_start - 7;
  LOOP
    SELECT COUNT(DISTINCT ad) INTO cnt
    FROM unnest(_dates) u(ad)
    WHERE ad >= w AND ad <= w + 6;
    IF cnt >= 3 THEN
      total_days := total_days + cnt;
      w := w - 7;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN total_days;
END $$;

REVOKE EXECUTE ON FUNCTION public._compute_streak_from_dates(date[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._compute_streak_from_dates(date[], date) TO authenticated, service_role;
