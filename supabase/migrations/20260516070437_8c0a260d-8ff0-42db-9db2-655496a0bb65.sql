CREATE OR REPLACE FUNCTION public.resolve_stock_concern(_concern_id uuid, _action text, _resolution_note text DEFAULT NULL::text)
RETURNS public.concern_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.stock_concerns%ROWTYPE;
  _current integer;
  _diff integer;
  _new_status public.concern_status;
  _is_admin boolean;
  _is_wsp_admin boolean;
  _user_wsp text;
BEGIN
  _is_admin := public.has_role(auth.uid(), 'admin');
  _is_wsp_admin := public.has_role(auth.uid(), 'wsp_admin');

  IF NOT (_is_admin OR _is_wsp_admin) THEN
    RAISE EXCEPTION 'Only admins or WSP admins can resolve concerns';
  END IF;

  IF _action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action %', _action;
  END IF;

  SELECT * INTO _row FROM public.stock_concerns
    WHERE id = _concern_id FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Concern not found';
  END IF;
  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'Concern is already %', _row.status;
  END IF;

  -- WSP admins can only resolve concerns for their own WSP
  IF NOT _is_admin AND _is_wsp_admin THEN
    SELECT wsp INTO _user_wsp FROM public.profiles WHERE id = auth.uid();
    IF _user_wsp IS NULL OR _user_wsp <> _row.wsp THEN
      RAISE EXCEPTION 'WSP admins can only resolve concerns for their own WSP';
    END IF;
  END IF;

  IF _action = 'approve' THEN
    SELECT qty INTO _current FROM public.stock
      WHERE wsp = _row.wsp AND material_code = _row.material_code FOR UPDATE;
    _current := COALESCE(_current, 0);
    _diff := _row.actual_qty - _current;

    IF _diff <> 0 THEN
      INSERT INTO public.stock (wsp, material_code, qty, updated_at)
      VALUES (_row.wsp, _row.material_code, GREATEST(_row.actual_qty, 0), now())
      ON CONFLICT (wsp, material_code) DO UPDATE
        SET qty = GREATEST(_row.actual_qty, 0), updated_at = now();
    END IF;
    _new_status := 'approved';
  ELSE
    _new_status := 'rejected';
  END IF;

  UPDATE public.stock_concerns
    SET status = _new_status,
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_note = nullif(btrim(_resolution_note), '')
    WHERE id = _concern_id;

  RETURN _new_status;
END;
$$;