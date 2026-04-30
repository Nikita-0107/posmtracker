-- Refine weekly TL allocation: verification model (no forced return)
-- Closure no longer returns remaining qty to wd_stock; remaining carries forward.
-- Next allocation's qty_allocated = carry_forward (from last closed week) + newly issued qty.
-- Only newly issued qty is deducted from wd_stock.

CREATE OR REPLACE FUNCTION public.close_weekly_tl_allocation(
  _allocation_id uuid,
  _remaining jsonb,
  _proof_image_path text,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alloc public.tl_weekly_allocations%ROWTYPE;
  _wd text;
  _is_admin boolean;
  _proof text;
  _entry jsonb;
  _code text;
  _rem integer;
  _line public.tl_weekly_allocation_items%ROWTYPE;
  _seen text[] := ARRAY[]::text[];
BEGIN
  _proof := nullif(btrim(_proof_image_path), '');
  IF _proof IS NULL THEN RAISE EXCEPTION 'Proof image is required'; END IF;

  IF _remaining IS NULL OR jsonb_typeof(_remaining) <> 'array' THEN
    RAISE EXCEPTION 'Remaining quantities are required';
  END IF;

  SELECT * INTO _alloc FROM public.tl_weekly_allocations
    WHERE id = _allocation_id FOR UPDATE;
  IF _alloc.id IS NULL THEN RAISE EXCEPTION 'Allocation not found'; END IF;
  IF _alloc.status = 'closed' THEN RAISE EXCEPTION 'Already closed'; END IF;

  _is_admin := public.has_role(auth.uid(), 'admin');
  _wd := public.current_user_wd();
  IF NOT _is_admin AND (_wd IS NULL OR _wd <> _alloc.wd_code) THEN
    RAISE EXCEPTION 'Not authorised to close this allocation';
  END IF;

  FOR _entry IN SELECT * FROM jsonb_array_elements(_remaining) LOOP
    _code := nullif(btrim(_entry->>'material_code'), '');
    _rem := nullif(_entry->>'qty_remaining', '')::integer;
    IF _code IS NULL THEN RAISE EXCEPTION 'Material code required for every remaining entry'; END IF;
    IF _rem IS NULL OR _rem < 0 THEN RAISE EXCEPTION 'Remaining qty must be >= 0 for %', _code; END IF;
    IF _code = ANY(_seen) THEN RAISE EXCEPTION 'Duplicate material % in remaining list', _code; END IF;
    _seen := array_append(_seen, _code);

    SELECT * INTO _line FROM public.tl_weekly_allocation_items
      WHERE allocation_id = _allocation_id AND material_code = _code FOR UPDATE;
    IF _line.id IS NULL THEN
      RAISE EXCEPTION 'Material % is not part of this allocation', _code;
    END IF;
    IF _rem > _line.qty_allocated THEN
      RAISE EXCEPTION 'Remaining (%) cannot exceed allocated (%) for %', _rem, _line.qty_allocated, _code;
    END IF;

    UPDATE public.tl_weekly_allocation_items
      SET qty_remaining = _rem,
          qty_used = _line.qty_allocated - _rem
      WHERE id = _line.id;
    -- NOTE: remaining stays with TL (carry-forward). No credit back to wd_stock.
  END LOOP;

  -- Any line not verified defaults to 0 remaining (fully used)
  UPDATE public.tl_weekly_allocation_items
    SET qty_remaining = 0, qty_used = qty_allocated
    WHERE allocation_id = _allocation_id AND qty_remaining IS NULL;

  UPDATE public.tl_weekly_allocations
    SET status = 'closed',
        closed_at = now(),
        closed_by = auth.uid(),
        closure_proof_image_path = _proof,
        closure_note = nullif(btrim(_note), '')
    WHERE id = _allocation_id;

  RETURN _allocation_id;
END;
$$;

-- Helper: carry-forward map (material_code -> qty_remaining) from the most recent CLOSED
-- allocation for a given TL. Returns empty set if none.
CREATE OR REPLACE FUNCTION public.tl_carry_forward(_wd_tl_id uuid)
RETURNS TABLE(material_code text, qty integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_closed AS (
    SELECT id FROM public.tl_weekly_allocations
    WHERE wd_tl_id = _wd_tl_id AND status = 'closed'
    ORDER BY week_start DESC
    LIMIT 1
  )
  SELECT i.material_code, COALESCE(i.qty_remaining, 0)::integer AS qty
  FROM public.tl_weekly_allocation_items i
  JOIN last_closed lc ON lc.id = i.allocation_id
  WHERE COALESCE(i.qty_remaining, 0) > 0
$$;

-- Recreate create_weekly_tl_allocation to fold in carry-forward
CREATE OR REPLACE FUNCTION public.create_weekly_tl_allocation(
  _wd_tl_id uuid,
  _items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wd text;
  _is_admin boolean;
  _tl_wd text;
  _week_start date := public.iso_week_monday(current_date);
  _week_end date := _week_start + 6;
  _alloc_id uuid := gen_random_uuid();
  _item jsonb;
  _code text;
  _qty integer;
  _current integer;
  _seen text[] := ARRAY[]::text[];
  _open_exists boolean;
  _carry record;
  _new_qty integer;
  _existing_alloc integer;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'Items payload is required';
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin');
  _wd := public.current_user_wd();
  IF NOT _is_admin AND _wd IS NULL THEN
    RAISE EXCEPTION 'No WD code on your account';
  END IF;

  SELECT wd_code INTO _tl_wd FROM public.wd_tls WHERE id = _wd_tl_id;
  IF _tl_wd IS NULL THEN
    RAISE EXCEPTION 'TL not found';
  END IF;
  IF NOT _is_admin AND _tl_wd <> _wd THEN
    RAISE EXCEPTION 'Selected TL does not belong to your WD';
  END IF;
  IF _wd IS NULL THEN _wd := _tl_wd; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tl_weekly_allocations
    WHERE wd_tl_id = _wd_tl_id AND status = 'open'
  ) INTO _open_exists;
  IF _open_exists THEN
    RAISE EXCEPTION 'Previous week is still open. Close it before creating a new allocation.';
  END IF;

  INSERT INTO public.tl_weekly_allocations
    (id, wd_code, wd_tl_id, week_start, week_end, created_by)
  VALUES (_alloc_id, _wd, _wd_tl_id, _week_start, _week_end, auth.uid());

  -- 1) Seed allocation lines with carry-forward from last closed week (no wd_stock change)
  FOR _carry IN SELECT * FROM public.tl_carry_forward(_wd_tl_id) LOOP
    INSERT INTO public.tl_weekly_allocation_items (allocation_id, material_code, qty_allocated)
    VALUES (_alloc_id, _carry.material_code, _carry.qty);
  END LOOP;

  -- 2) Apply newly issued quantities (deduct from wd_stock, add on top of carry-forward)
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _code := nullif(btrim(_item->>'material_code'), '');
    _new_qty := nullif(_item->>'qty', '')::integer;
    IF _code IS NULL THEN RAISE EXCEPTION 'Material code required for every item'; END IF;
    IF _new_qty IS NULL OR _new_qty < 0 THEN
      RAISE EXCEPTION 'Quantity must be >= 0 for material %', _code;
    END IF;
    IF _code = ANY(_seen) THEN RAISE EXCEPTION 'Duplicate material % in this allocation', _code; END IF;
    _seen := array_append(_seen, _code);

    IF _new_qty = 0 THEN CONTINUE; END IF;

    SELECT qty INTO _current FROM public.wd_stock
      WHERE wd_code = _wd AND material_code = _code FOR UPDATE;
    IF _current IS NULL THEN RAISE EXCEPTION 'No WD stock for material %', _code; END IF;
    IF _new_qty > _current THEN
      RAISE EXCEPTION 'Not enough WD stock for material % (have %, need %)', _code, _current, _new_qty;
    END IF;

    UPDATE public.wd_stock
      SET qty = qty - _new_qty, updated_at = now()
      WHERE wd_code = _wd AND material_code = _code;

    SELECT qty_allocated INTO _existing_alloc FROM public.tl_weekly_allocation_items
      WHERE allocation_id = _alloc_id AND material_code = _code FOR UPDATE;

    IF _existing_alloc IS NULL THEN
      INSERT INTO public.tl_weekly_allocation_items (allocation_id, material_code, qty_allocated)
      VALUES (_alloc_id, _code, _new_qty);
    ELSE
      UPDATE public.tl_weekly_allocation_items
        SET qty_allocated = _existing_alloc + _new_qty
        WHERE allocation_id = _alloc_id AND material_code = _code;
    END IF;
  END LOOP;

  -- Require at least one line on the allocation
  IF NOT EXISTS (
    SELECT 1 FROM public.tl_weekly_allocation_items WHERE allocation_id = _alloc_id
  ) THEN
    DELETE FROM public.tl_weekly_allocations WHERE id = _alloc_id;
    RAISE EXCEPTION 'Nothing to allocate. Add a material or wait for carry-forward from a closed week.';
  END IF;

  RETURN _alloc_id;
END;
$$;