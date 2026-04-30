CREATE OR REPLACE FUNCTION public.iso_week_monday(_d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (_d - ((EXTRACT(ISODOW FROM _d)::int - 1)) * INTERVAL '1 day')::date
$$;