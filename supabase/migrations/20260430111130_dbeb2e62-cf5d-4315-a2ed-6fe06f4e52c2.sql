-- Weekly TL Allocation system
-- Source of truth: physical wd_stock. Allocation deducts from wd_stock.
-- Closure: WD enters remaining qty -> remaining returns to wd_stock; used = allocated - remaining.

-- Enum for allocation status
DO $$ BEGIN
  CREATE TYPE public.tl_alloc_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Weekly allocation header (one per WD + TL + week)
CREATE TABLE IF NOT EXISTS public.tl_weekly_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  wd_tl_id uuid NOT NULL REFERENCES public.wd_tls(id) ON DELETE RESTRICT,
  week_start date NOT NULL, -- always Monday
  week_end date NOT NULL,   -- always Sunday (week_start + 6)
  status public.tl_alloc_status NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  closure_proof_image_path text,
  closure_note text,
  CONSTRAINT tl_weekly_allocations_week_chk CHECK (week_end = week_start + INTERVAL '6 days'),
  CONSTRAINT tl_weekly_allocations_unique UNIQUE (wd_tl_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_tl_weekly_allocations_wd ON public.tl_weekly_allocations(wd_code, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_tl_weekly_allocations_tl ON public.tl_weekly_allocations(wd_tl_id, week_start DESC);

-- Allocation line items
CREATE TABLE IF NOT EXISTS public.tl_weekly_allocation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES public.tl_weekly_allocations(id) ON DELETE CASCADE,
  material_code text NOT NULL,
  qty_allocated integer NOT NULL CHECK (qty_allocated > 0),
  qty_remaining integer, -- filled at closure
  qty_used integer,      -- computed at closure = allocated - remaining
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tl_weekly_allocation_items_unique UNIQUE (allocation_id, material_code)
);

CREATE INDEX IF NOT EXISTS idx_tl_weekly_allocation_items_alloc
  ON public.tl_weekly_allocation_items(allocation_id);

-- Enable RLS
ALTER TABLE public.tl_weekly_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tl_weekly_allocation_items ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "WD view own weekly allocations" ON public.tl_weekly_allocations;
CREATE POLICY "WD view own weekly allocations" ON public.tl_weekly_allocations
  FOR SELECT TO authenticated
  USING (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "View weekly allocation items via parent" ON public.tl_weekly_allocation_items;
CREATE POLICY "View weekly allocation items via parent" ON public.tl_weekly_allocation_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tl_weekly_allocations a
    WHERE a.id = tl_weekly_allocation_items.allocation_id
      AND (a.wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'))
  ));
-- Inserts/updates only via SECURITY DEFINER RPCs.

-- Helper: ISO Monday for any date
CREATE OR REPLACE FUNCTION public.iso_week_monday(_d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (_d - ((EXTRACT(ISODOW FROM _d)::int - 1)) * INTERVAL '1 day')::date
$$;

-- RPC: create weekly allocation
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
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
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

  -- Block if any prior allocation for this TL is still open
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

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _code := nullif(btrim(_item->>'material_code'), '');
    _qty := nullif(_item->>'qty', '')::integer;
    IF _code IS NULL THEN RAISE EXCEPTION 'Material code required for every item'; END IF;
    IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity must be positive for material %', _code; END IF;
    IF _code = ANY(_seen) THEN RAISE EXCEPTION 'Duplicate material % in this allocation', _code; END IF;
    _seen := array_append(_seen, _code);

    SELECT qty INTO _current FROM public.wd_stock
      WHERE wd_code = _wd AND material_code = _code FOR UPDATE;
    IF _current IS NULL THEN RAISE EXCEPTION 'No WD stock for material %', _code; END IF;
    IF _qty > _current THEN
      RAISE EXCEPTION 'Not enough WD stock for material % (have %, need %)', _code, _current, _qty;
    END IF;

    UPDATE public.wd_stock
      SET qty = qty - _qty, updated_at = now()
      WHERE wd_code = _wd AND material_code = _code;

    INSERT INTO public.tl_weekly_allocation_items (allocation_id, material_code, qty_allocated)
    VALUES (_alloc_id, _code, _qty);
  END LOOP;

  RETURN _alloc_id;
END;
$$;

-- RPC: close weekly allocation
CREATE OR REPLACE FUNCTION public.close_weekly_tl_allocation(
  _allocation_id uuid,
  _remaining jsonb,        -- [{material_code, qty_remaining}]
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

  -- Default remaining = 0 for missing lines (fully used)
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

    -- Return remaining to WD stock
    IF _rem > 0 THEN
      INSERT INTO public.wd_stock (wd_code, material_code, qty, updated_at)
      VALUES (_alloc.wd_code, _code, _rem, now())
      ON CONFLICT (wd_code, material_code) DO UPDATE
        SET qty = public.wd_stock.qty + EXCLUDED.qty, updated_at = now();
    END IF;
  END LOOP;

  -- Any line not present in _remaining defaults to 0 (fully used)
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