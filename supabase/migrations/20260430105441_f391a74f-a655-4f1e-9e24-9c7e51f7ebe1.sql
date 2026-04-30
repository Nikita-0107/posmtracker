-- Extend stock_movement_edits with dispatch-specific old/new columns
ALTER TABLE public.stock_movement_edits
  ADD COLUMN IF NOT EXISTS old_distributor text,
  ADD COLUMN IF NOT EXISTS new_distributor text,
  ADD COLUMN IF NOT EXISTS old_dispatch_date date,
  ADD COLUMN IF NOT EXISTS new_dispatch_date date;

-- Full-edit RPC for dispatch entries (mirrors edit_receive_entry)
CREATE OR REPLACE FUNCTION public.edit_dispatch_entry(
  _movement_id uuid,
  _new_qty integer,
  _new_distributor text,
  _new_dispatch_date date,
  _new_proof_image_path text,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.stock_movements%ROWTYPE;
  _wsp public.wsp_code;
  _is_admin boolean;
  _clean_reason text;
  _clean_dist text;
  _clean_proof text;
  _current integer;
  _pending_others integer;
  _new_id uuid := gen_random_uuid();
BEGIN
  IF _new_qty IS NULL OR _new_qty <= 0 THEN
    RAISE EXCEPTION 'New quantity must be positive';
  END IF;

  _clean_reason := nullif(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'Reason for change is required';
  END IF;

  _clean_dist := nullif(btrim(_new_distributor), '');
  IF _clean_dist IS NULL THEN
    RAISE EXCEPTION 'Distributor is required';
  END IF;

  _clean_proof := nullif(btrim(_new_proof_image_path), '');
  IF _clean_proof IS NULL THEN
    RAISE EXCEPTION 'Proof image is required';
  END IF;

  IF _new_dispatch_date IS NULL THEN
    RAISE EXCEPTION 'Dispatch date is required';
  END IF;
  IF _new_dispatch_date > current_date THEN
    RAISE EXCEPTION 'Dispatch date cannot be in the future';
  END IF;

  SELECT * INTO _row FROM public.stock_movements
    WHERE id = _movement_id FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Movement not found';
  END IF;
  IF _row.movement <> 'dispatch' THEN
    RAISE EXCEPTION 'Only dispatch entries can be edited here';
  END IF;
  IF _row.corrected_at IS NOT NULL THEN
    RAISE EXCEPTION 'This entry has already been corrected';
  END IF;
  IF _row.item_status IS DISTINCT FROM 'pending'::public.dispatch_item_status THEN
    RAISE EXCEPTION 'Editing locked: this dispatch line has already been verified by WD.';
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  SELECT wsp INTO _wsp FROM public.profiles WHERE id = auth.uid();

  IF NOT _is_admin AND (_wsp IS NULL OR _wsp <> _row.wsp) THEN
    RAISE EXCEPTION 'Not authorised to edit this entry';
  END IF;

  IF NOT _is_admin AND _row.created_at < now() - interval '48 hours' THEN
    RAISE EXCEPTION 'Editing locked. Contact admin.';
  END IF;

  -- If qty increased, ensure available stock supports the increase.
  IF _new_qty > _row.qty THEN
    SELECT qty INTO _current FROM public.stock
      WHERE wsp = _row.wsp AND material_code = _row.material_code;
    IF _current IS NULL THEN
      RAISE EXCEPTION 'No stock for material %', _row.material_code;
    END IF;
    SELECT COALESCE(SUM(qty), 0) INTO _pending_others
      FROM public.stock_movements
      WHERE wsp = _row.wsp
        AND material_code = _row.material_code
        AND movement = 'dispatch'
        AND item_status = 'pending'
        AND id <> _row.id;
    IF (_new_qty - _row.qty) > (_current - _pending_others - _row.qty) THEN
      RAISE EXCEPTION 'Not enough available stock to increase dispatch quantity';
    END IF;
  END IF;

  -- Mark original as corrected (keeps original qty intact, no stock change since pending dispatch doesn't move stock)
  UPDATE public.stock_movements
    SET corrected_at = now(),
        corrected_by = auth.uid(),
        corrected_by_movement_id = _new_id,
        item_status = 'closed_loss' -- park the original out of pending so totals stay correct
    WHERE id = _movement_id;

  -- Create new corrected dispatch entry (still pending)
  INSERT INTO public.stock_movements (
    id, wsp, material_code, qty, movement, distributor, performed_by,
    proof_image_path, dispatch_id, dispatch_date, item_status, parent_movement_id
  ) VALUES (
    _new_id, _row.wsp, _row.material_code, _new_qty, 'dispatch', _clean_dist, auth.uid(),
    _clean_proof, _row.dispatch_id, _new_dispatch_date, 'pending', _row.id
  );

  -- Audit
  INSERT INTO public.stock_movement_edits (
    movement_id, old_quantity, new_quantity, edited_by, edit_reason,
    old_distributor, new_distributor,
    old_dispatch_date, new_dispatch_date,
    old_proof_image_path, new_proof_image_path,
    new_movement_id
  ) VALUES (
    _movement_id, _row.qty, _new_qty, auth.uid(), _clean_reason,
    _row.distributor, _clean_dist,
    _row.dispatch_date, _new_dispatch_date,
    _row.proof_image_path, _clean_proof,
    _new_id
  );

  RETURN _new_id;
END;
$$;