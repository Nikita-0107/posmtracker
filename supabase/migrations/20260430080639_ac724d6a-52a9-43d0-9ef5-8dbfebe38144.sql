
-- Extend stock_movement_edits to capture full-entry edits
ALTER TABLE public.stock_movement_edits
  ADD COLUMN IF NOT EXISTS old_material_code text,
  ADD COLUMN IF NOT EXISTS new_material_code text,
  ADD COLUMN IF NOT EXISTS old_received_date date,
  ADD COLUMN IF NOT EXISTS new_received_date date,
  ADD COLUMN IF NOT EXISTS old_batch_type public.batch_type,
  ADD COLUMN IF NOT EXISTS new_batch_type public.batch_type,
  ADD COLUMN IF NOT EXISTS old_reference_number text,
  ADD COLUMN IF NOT EXISTS new_reference_number text,
  ADD COLUMN IF NOT EXISTS old_proof_image_path text,
  ADD COLUMN IF NOT EXISTS new_proof_image_path text,
  ADD COLUMN IF NOT EXISTS new_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL;

-- Mark original entries that have been corrected (replaced by a new entry)
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_by uuid,
  ADD COLUMN IF NOT EXISTS corrected_by_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL;

-- The unique index on (wsp, material_code, reference_number) for receive must
-- allow the original (now corrected) and the new corrected entry. Replace it
-- with a partial index that excludes corrected originals.
DROP INDEX IF EXISTS public.stock_movements_receive_ref_unique;
CREATE UNIQUE INDEX stock_movements_receive_ref_unique
  ON public.stock_movements (wsp, material_code, reference_number)
  WHERE movement = 'receive'::public.movement_type
    AND reference_number IS NOT NULL
    AND corrected_at IS NULL;

-- Full-entry edit RPC for receive movements.
CREATE OR REPLACE FUNCTION public.edit_receive_entry(
  _movement_id uuid,
  _new_qty integer,
  _new_material_code text,
  _new_received_date date,
  _new_batch_type public.batch_type,
  _new_reference_number text,
  _new_proof_image_path text,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.stock_movements%ROWTYPE;
  _wsp public.wsp_code;
  _is_admin boolean;
  _clean_reason text;
  _clean_ref text;
  _clean_proof text;
  _later_dispatch boolean;
  _current integer;
  _new_id uuid := gen_random_uuid();
BEGIN
  IF _new_qty IS NULL OR _new_qty <= 0 THEN
    RAISE EXCEPTION 'New quantity must be positive';
  END IF;

  _clean_reason := nullif(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'Reason for change is required';
  END IF;

  _clean_ref := nullif(btrim(_new_reference_number), '');
  IF _clean_ref IS NULL THEN
    RAISE EXCEPTION 'PO/Reference number is required';
  END IF;

  _clean_proof := nullif(btrim(_new_proof_image_path), '');
  IF _clean_proof IS NULL THEN
    RAISE EXCEPTION 'Proof image is required';
  END IF;

  IF _new_received_date IS NULL THEN
    RAISE EXCEPTION 'Received date is required';
  END IF;
  IF _new_received_date > current_date THEN
    RAISE EXCEPTION 'Received date cannot be in the future';
  END IF;

  IF _new_material_code IS NULL OR btrim(_new_material_code) = '' THEN
    RAISE EXCEPTION 'Material is required';
  END IF;

  SELECT * INTO _row FROM public.stock_movements
    WHERE id = _movement_id FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Movement not found';
  END IF;
  IF _row.movement <> 'receive' THEN
    RAISE EXCEPTION 'Only receive entries can be edited here';
  END IF;
  IF _row.corrected_at IS NOT NULL THEN
    RAISE EXCEPTION 'This entry has already been corrected';
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  SELECT wsp INTO _wsp FROM public.profiles WHERE id = auth.uid();

  IF NOT _is_admin AND (_wsp IS NULL OR _wsp <> _row.wsp) THEN
    RAISE EXCEPTION 'Not authorised to edit this entry';
  END IF;

  IF NOT _is_admin AND _row.created_at < now() - interval '48 hours' THEN
    RAISE EXCEPTION 'Editing locked. Contact admin.';
  END IF;

  -- Block edit if any later dispatch exists for the original material
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

  -- Material must exist
  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE code = _new_material_code) THEN
    RAISE EXCEPTION 'Material % does not exist', _new_material_code;
  END IF;

  -- Adjust stock: reverse original, then apply new
  -- Reverse original qty from original material
  SELECT qty INTO _current FROM public.stock
    WHERE wsp = _row.wsp AND material_code = _row.material_code
    FOR UPDATE;
  IF _current IS NULL OR _current < _row.qty THEN
    RAISE EXCEPTION 'Cannot reverse: insufficient stock for original material % (have %, need %)',
      _row.material_code, COALESCE(_current, 0), _row.qty;
  END IF;
  UPDATE public.stock
    SET qty = qty - _row.qty, updated_at = now()
    WHERE wsp = _row.wsp AND material_code = _row.material_code;

  -- Apply new qty to new material
  INSERT INTO public.stock (wsp, material_code, qty, updated_at)
  VALUES (_row.wsp, _new_material_code, _new_qty, now())
  ON CONFLICT (wsp, material_code) DO UPDATE
    SET qty = public.stock.qty + EXCLUDED.qty, updated_at = now();

  -- Mark original as corrected
  UPDATE public.stock_movements
    SET corrected_at = now(),
        corrected_by = auth.uid(),
        corrected_by_movement_id = _new_id
    WHERE id = _movement_id;

  -- Create new corrected entry
  INSERT INTO public.stock_movements (
    id, wsp, material_code, qty, movement, performed_by,
    reference_number, proof_image_path, received_date, batch_type,
    parent_movement_id, receive_id
  ) VALUES (
    _new_id, _row.wsp, _new_material_code, _new_qty, 'receive', auth.uid(),
    _clean_ref, _clean_proof, _new_received_date,
    COALESCE(_new_batch_type, _row.batch_type),
    _row.id, _row.receive_id
  );

  -- Audit
  INSERT INTO public.stock_movement_edits (
    movement_id, old_quantity, new_quantity, edited_by, edit_reason,
    old_material_code, new_material_code,
    old_received_date, new_received_date,
    old_batch_type, new_batch_type,
    old_reference_number, new_reference_number,
    old_proof_image_path, new_proof_image_path,
    new_movement_id
  ) VALUES (
    _movement_id, _row.qty, _new_qty, auth.uid(), _clean_reason,
    _row.material_code, _new_material_code,
    _row.received_date, _new_received_date,
    _row.batch_type, COALESCE(_new_batch_type, _row.batch_type),
    _row.reference_number, _clean_ref,
    _row.proof_image_path, _clean_proof,
    _new_id
  );

  RETURN _new_id;
END;
$function$;
