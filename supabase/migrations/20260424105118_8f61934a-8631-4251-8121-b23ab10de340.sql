CREATE OR REPLACE FUNCTION public.request_movement_correction(
  _movement_id uuid,
  _new_qty integer,
  _reason text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.stock_movements%ROWTYPE;
  _wsp public.wsp_code;
  _is_admin boolean;
  _clean_reason text;
  _diff integer;
  _current integer;
  _later_dispatch boolean;
BEGIN
  IF _new_qty IS NULL OR _new_qty <= 0 THEN
    RAISE EXCEPTION 'New quantity must be positive';
  END IF;

  _clean_reason := nullif(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'Reason for change is required';
  END IF;

  SELECT * INTO _row FROM public.stock_movements
    WHERE id = _movement_id
    FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Movement not found';
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  SELECT wsp INTO _wsp FROM public.profiles WHERE id = auth.uid();

  IF NOT _is_admin AND (_wsp IS NULL OR _wsp <> _row.wsp) THEN
    RAISE EXCEPTION 'Not authorised to edit this entry';
  END IF;

  IF _row.created_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Editing locked. Contact admin.';
  END IF;

  IF _row.movement = 'receive' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.stock_movements
      WHERE wsp = _row.wsp
        AND material_code = _row.material_code
        AND movement = 'dispatch'
        AND created_at > _row.created_at
    ) INTO _later_dispatch;
    IF _later_dispatch THEN
      RAISE EXCEPTION 'Editing locked: this material has already been dispatched after this entry.';
    END IF;

    _diff := _new_qty - _row.qty;

    IF _diff <> 0 THEN
      SELECT qty INTO _current FROM public.stock
        WHERE wsp = _row.wsp AND material_code = _row.material_code
        FOR UPDATE;
      IF _current IS NULL THEN
        RAISE EXCEPTION 'No stock row for material %', _row.material_code;
      END IF;
      IF _current + _diff < 0 THEN
        RAISE EXCEPTION 'Cannot reduce: would make stock negative (current %, change %)', _current, _diff;
      END IF;
      UPDATE public.stock
        SET qty = qty + _diff, updated_at = now()
        WHERE wsp = _row.wsp AND material_code = _row.material_code;
    END IF;

  ELSIF _row.movement = 'dispatch' THEN
    IF _row.item_status IS DISTINCT FROM 'pending'::public.dispatch_item_status THEN
      RAISE EXCEPTION 'Editing locked: this dispatch line has already been verified by WD.';
    END IF;

    _diff := _new_qty - _row.qty;

    IF _diff > 0 THEN
      SELECT qty INTO _current FROM public.stock
        WHERE wsp = _row.wsp AND material_code = _row.material_code;
      IF _current IS NULL THEN
        RAISE EXCEPTION 'No stock for material %', _row.material_code;
      END IF;
      IF _diff > _current - COALESCE((
        SELECT SUM(qty) FROM public.stock_movements
        WHERE wsp = _row.wsp
          AND material_code = _row.material_code
          AND movement = 'dispatch'
          AND item_status = 'pending'
          AND id <> _row.id
      ), 0) - _row.qty THEN
        RAISE EXCEPTION 'Not enough available stock to increase dispatch quantity';
      END IF;
    END IF;

  ELSE
    RAISE EXCEPTION 'Only receive and dispatch movements can be corrected';
  END IF;

  UPDATE public.stock_movements
    SET qty = _new_qty
    WHERE id = _movement_id;

  INSERT INTO public.stock_movement_edits (movement_id, old_quantity, new_quantity, edited_by, edit_reason)
  VALUES (_movement_id, _row.qty, _new_qty, auth.uid(), _clean_reason);

  RETURN _new_qty;
END;
$$;