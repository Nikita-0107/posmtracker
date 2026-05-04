-- ───────────────────────── ENUMS ─────────────────────────
DO $$ BEGIN
  CREATE TYPE public.wd_transfer_status AS ENUM ('pending','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wd_transfer_item_status AS ENUM ('pending','received','partial','issue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────── TABLES ─────────────────────────
CREATE TABLE IF NOT EXISTS public.wd_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_wd_code text NOT NULL,
  to_wd_code text NOT NULL,
  status public.wd_transfer_status NOT NULL DEFAULT 'pending',
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT wd_transfers_diff_wd CHECK (from_wd_code <> to_wd_code)
);

CREATE INDEX IF NOT EXISTS idx_wd_transfers_from ON public.wd_transfers(from_wd_code, status);
CREATE INDEX IF NOT EXISTS idx_wd_transfers_to ON public.wd_transfers(to_wd_code, status);

CREATE TABLE IF NOT EXISTS public.wd_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.wd_transfers(id) ON DELETE CASCADE,
  material_code text NOT NULL,
  qty_requested integer NOT NULL CHECK (qty_requested > 0),
  qty_confirmed integer,
  item_status public.wd_transfer_item_status NOT NULL DEFAULT 'pending',
  issue_note text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wd_transfer_items_transfer ON public.wd_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_wd_transfer_items_material ON public.wd_transfer_items(material_code);

-- ───────────────────────── RLS ─────────────────────────
ALTER TABLE public.wd_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wd_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sender or receiver WD can view transfers"
ON public.wd_transfers FOR SELECT TO authenticated
USING (
  from_wd_code = public.current_user_wd()
  OR to_wd_code = public.current_user_wd()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "View transfer items via parent transfer"
ON public.wd_transfer_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.wd_transfers t
  WHERE t.id = wd_transfer_items.transfer_id
    AND (t.from_wd_code = public.current_user_wd()
         OR t.to_wd_code = public.current_user_wd()
         OR public.has_role(auth.uid(), 'admin'::public.app_role))
));

-- ───────────────────────── RPCs ─────────────────────────
-- Create a new inter-WD transfer (sender side)
CREATE OR REPLACE FUNCTION public.create_wd_transfer(
  _to_wd_code text,
  _items jsonb,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _from_wd text;
  _is_admin boolean;
  _to text;
  _transfer_id uuid := gen_random_uuid();
  _item jsonb;
  _code text;
  _qty integer;
  _current integer;
  _reserved integer;
  _seen text[] := ARRAY[]::text[];
  _u record;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  _to := nullif(btrim(_to_wd_code), '');
  IF _to IS NULL THEN RAISE EXCEPTION 'Destination WD is required'; END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  _from_wd := public.current_user_wd();
  IF NOT _is_admin AND _from_wd IS NULL THEN
    RAISE EXCEPTION 'No WD code on your account';
  END IF;
  IF _from_wd IS NULL THEN _from_wd := _to; END IF; -- admin path safety
  IF _from_wd = _to THEN RAISE EXCEPTION 'Cannot transfer to the same WD'; END IF;

  -- Validate destination WD exists in master assignments (any WD that has at least one assignment row)
  IF NOT EXISTS (
    SELECT 1 FROM public.wd_assignments WHERE wd_code = _to
    UNION SELECT 1 FROM public.wd_stock WHERE wd_code = _to
    UNION SELECT 1 FROM public.profiles WHERE wd_code = _to
  ) THEN
    RAISE EXCEPTION 'Destination WD % does not exist', _to;
  END IF;

  INSERT INTO public.wd_transfers (id, from_wd_code, to_wd_code, status, note, created_by)
  VALUES (_transfer_id, _from_wd, _to, 'pending', nullif(btrim(_note), ''), auth.uid());

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _code := nullif(btrim(_item->>'material_code'), '');
    _qty := nullif(_item->>'qty', '')::integer;

    IF _code IS NULL THEN RAISE EXCEPTION 'Material code is required for every item'; END IF;
    IF _qty IS NULL OR _qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be positive for material %', _code;
    END IF;
    IF _code = ANY(_seen) THEN
      RAISE EXCEPTION 'Duplicate material % in this transfer', _code;
    END IF;
    _seen := array_append(_seen, _code);

    SELECT qty INTO _current FROM public.wd_stock
      WHERE wd_code = _from_wd AND material_code = _code;
    IF _current IS NULL THEN
      RAISE EXCEPTION 'No WD stock for material %', _code;
    END IF;

    -- Reserved = sum of qty_requested across other pending outgoing transfers for same material
    SELECT COALESCE(SUM(i.qty_requested), 0) INTO _reserved
    FROM public.wd_transfer_items i
    JOIN public.wd_transfers t ON t.id = i.transfer_id
    WHERE t.from_wd_code = _from_wd
      AND t.status = 'pending'
      AND i.item_status = 'pending'
      AND i.material_code = _code
      AND t.id <> _transfer_id;

    IF _qty > (_current - _reserved) THEN
      RAISE EXCEPTION 'Not enough available stock for % (have %, reserved %, need %)',
        _code, _current, _reserved, _qty;
    END IF;

    INSERT INTO public.wd_transfer_items (transfer_id, material_code, qty_requested)
    VALUES (_transfer_id, _code, _qty);
  END LOOP;

  -- Notify receiver WD users
  FOR _u IN SELECT id FROM public.profiles WHERE wd_code = _to LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (
      _u.id,
      'wd_transfer_in',
      'Incoming WD transfer',
      format('New transfer from %s with %s item(s).', _from_wd, jsonb_array_length(_items)),
      '/wd-transfer',
      _transfer_id
    );
  END LOOP;

  RETURN _transfer_id;
END;
$$;

-- Confirm a single transfer line (receiver side)
CREATE OR REPLACE FUNCTION public.confirm_wd_transfer_item(
  _item_id uuid,
  _action text, -- 'received' | 'partial' | 'issue'
  _confirmed_qty integer DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS public.wd_transfer_item_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _it public.wd_transfer_items%ROWTYPE;
  _t public.wd_transfers%ROWTYPE;
  _wd text;
  _is_admin boolean;
  _qty integer;
  _new_status public.wd_transfer_item_status;
  _from_current integer;
  _u record;
  _open_left integer;
BEGIN
  IF _action NOT IN ('received','partial','issue') THEN
    RAISE EXCEPTION 'Invalid action %', _action;
  END IF;

  SELECT * INTO _it FROM public.wd_transfer_items WHERE id = _item_id FOR UPDATE;
  IF _it.id IS NULL THEN RAISE EXCEPTION 'Transfer item not found'; END IF;
  IF _it.item_status <> 'pending' THEN
    RAISE EXCEPTION 'Item already finalised (%)', _it.item_status;
  END IF;

  SELECT * INTO _t FROM public.wd_transfers WHERE id = _it.transfer_id FOR UPDATE;
  IF _t.status <> 'pending' THEN
    RAISE EXCEPTION 'Transfer is %', _t.status;
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  _wd := public.current_user_wd();
  IF NOT _is_admin AND (_wd IS NULL OR _wd <> _t.to_wd_code) THEN
    RAISE EXCEPTION 'Only the receiving WD can confirm this transfer';
  END IF;

  IF _action = 'received' THEN
    _qty := _it.qty_requested;
    _new_status := 'received';
  ELSIF _action = 'partial' THEN
    IF _confirmed_qty IS NULL OR _confirmed_qty <= 0 OR _confirmed_qty >= _it.qty_requested THEN
      RAISE EXCEPTION 'Partial qty must be > 0 and < requested (%)', _it.qty_requested;
    END IF;
    _qty := _confirmed_qty;
    _new_status := 'partial';
  ELSE -- issue
    _qty := 0;
    _new_status := 'issue';
    IF nullif(btrim(_note), '') IS NULL THEN
      RAISE EXCEPTION 'Issue note is required';
    END IF;
  END IF;

  -- Stock movement: deduct confirmed qty from sender, add to receiver
  IF _qty > 0 THEN
    SELECT qty INTO _from_current FROM public.wd_stock
      WHERE wd_code = _t.from_wd_code AND material_code = _it.material_code
      FOR UPDATE;
    IF _from_current IS NULL OR _from_current < _qty THEN
      RAISE EXCEPTION 'Sender no longer has enough stock (have %, need %)',
        COALESCE(_from_current, 0), _qty;
    END IF;
    UPDATE public.wd_stock
      SET qty = qty - _qty, updated_at = now()
      WHERE wd_code = _t.from_wd_code AND material_code = _it.material_code;

    INSERT INTO public.wd_stock (wd_code, material_code, qty, updated_at)
    VALUES (_t.to_wd_code, _it.material_code, _qty, now())
    ON CONFLICT (wd_code, material_code) DO UPDATE
      SET qty = public.wd_stock.qty + EXCLUDED.qty, updated_at = now();
  END IF;

  UPDATE public.wd_transfer_items
    SET item_status = _new_status,
        qty_confirmed = _qty,
        issue_note = nullif(btrim(_note), ''),
        confirmed_at = now(),
        confirmed_by = auth.uid()
    WHERE id = _item_id;

  -- Close transfer header if no more pending items
  SELECT COUNT(*) INTO _open_left
    FROM public.wd_transfer_items
    WHERE transfer_id = _t.id AND item_status = 'pending';
  IF _open_left = 0 THEN
    UPDATE public.wd_transfers
      SET status = 'completed', completed_at = now()
      WHERE id = _t.id;
  END IF;

  -- Notify sender users
  FOR _u IN SELECT id FROM public.profiles WHERE wd_code = _t.from_wd_code LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (
      _u.id,
      'wd_transfer_out',
      'Transfer line confirmed',
      format('%s confirmed %s for %s (%s).', _t.to_wd_code, _new_status::text, _it.material_code, COALESCE(_qty, 0)),
      '/wd-transfer',
      _t.id
    );
  END LOOP;

  RETURN _new_status;
END;
$$;

-- Need a unique constraint on wd_stock(wd_code, material_code) for ON CONFLICT to work
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wd_stock_wd_code_material_code_key'
  ) THEN
    ALTER TABLE public.wd_stock
      ADD CONSTRAINT wd_stock_wd_code_material_code_key UNIQUE (wd_code, material_code);
  END IF;
END $$;