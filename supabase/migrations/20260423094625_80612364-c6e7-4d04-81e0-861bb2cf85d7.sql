-- ============================================================
-- WD → TL issuance tracking
-- ============================================================

-- Header table: one row per WD→TL issuance event
CREATE TABLE public.tl_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  tl_user_id uuid NOT NULL,
  issue_date date NOT NULL DEFAULT current_date,
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tl_issuances_wd ON public.tl_issuances(wd_code);
CREATE INDEX idx_tl_issuances_tl ON public.tl_issuances(tl_user_id);

-- Line items
CREATE TABLE public.tl_issuance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid NOT NULL REFERENCES public.tl_issuances(id) ON DELETE CASCADE,
  material_code text NOT NULL,
  qty_issued integer NOT NULL CHECK (qty_issued > 0),
  qty_used integer NOT NULL DEFAULT 0 CHECK (qty_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (qty_used <= qty_issued)
);

CREATE INDEX idx_tl_issuance_items_issuance ON public.tl_issuance_items(issuance_id);
CREATE INDEX idx_tl_issuance_items_material ON public.tl_issuance_items(material_code);

-- TL uploads (placement proofs)
CREATE TABLE public.tl_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_item_id uuid NOT NULL REFERENCES public.tl_issuance_items(id) ON DELETE CASCADE,
  qty integer NOT NULL CHECK (qty > 0),
  proof_image_path text NOT NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tl_uploads_item ON public.tl_uploads(issuance_item_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.tl_issuances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tl_issuance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tl_uploads ENABLE ROW LEVEL SECURITY;

-- tl_issuances policies
CREATE POLICY "WD can view own issuances"
  ON public.tl_issuances FOR SELECT TO authenticated
  USING (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "TL can view issuances addressed to them"
  ON public.tl_issuances FOR SELECT TO authenticated
  USING (tl_user_id = auth.uid());

CREATE POLICY "WD can create own issuances"
  ON public.tl_issuances FOR INSERT TO authenticated
  WITH CHECK (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'));

-- tl_issuance_items policies (inherit access via parent)
CREATE POLICY "View items via parent issuance"
  ON public.tl_issuance_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tl_issuances i
      WHERE i.id = tl_issuance_items.issuance_id
        AND (
          i.wd_code = public.current_user_wd()
          OR i.tl_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

CREATE POLICY "Insert items via parent issuance"
  ON public.tl_issuance_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tl_issuances i
      WHERE i.id = tl_issuance_items.issuance_id
        AND (
          i.wd_code = public.current_user_wd()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

CREATE POLICY "Update items via parent issuance"
  ON public.tl_issuance_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tl_issuances i
      WHERE i.id = tl_issuance_items.issuance_id
        AND (
          i.tl_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

-- tl_uploads policies
CREATE POLICY "View uploads via parent item"
  ON public.tl_uploads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tl_issuance_items it
      JOIN public.tl_issuances i ON i.id = it.issuance_id
      WHERE it.id = tl_uploads.issuance_item_id
        AND (
          i.wd_code = public.current_user_wd()
          OR i.tl_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

CREATE POLICY "TL can insert own uploads"
  ON public.tl_uploads FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tl_issuance_items it
      JOIN public.tl_issuances i ON i.id = it.issuance_id
      WHERE it.id = tl_uploads.issuance_item_id
        AND (i.tl_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ============================================================
-- RPC: issue_to_tl
-- ============================================================
CREATE OR REPLACE FUNCTION public.issue_to_tl(
  _tl_user_id uuid,
  _issue_date date,
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
  _idate date;
  _issuance_id uuid := gen_random_uuid();
  _item jsonb;
  _code text;
  _qty integer;
  _current integer;
  _seen text[] := array[]::text[];
  _wsp public.wsp_code;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  _idate := COALESCE(_issue_date, current_date);
  IF _idate > current_date THEN
    RAISE EXCEPTION 'Issue date cannot be in the future';
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin');
  _wd := public.current_user_wd();

  IF NOT _is_admin AND _wd IS NULL THEN
    RAISE EXCEPTION 'No WD code on your account';
  END IF;

  -- Verify TL belongs to this WD's region (skip for admin)
  SELECT wd_code INTO _tl_wd FROM public.profiles WHERE id = _tl_user_id;
  IF _tl_wd IS NULL THEN
    RAISE EXCEPTION 'Selected TL has no WD assigned';
  END IF;
  IF NOT _is_admin AND _tl_wd <> _wd THEN
    RAISE EXCEPTION 'Selected TL does not belong to your WD region';
  END IF;

  -- Ensure target user actually has tl role
  IF NOT public.has_role(_tl_user_id, 'tl') THEN
    RAISE EXCEPTION 'Selected user is not a TL';
  END IF;

  -- For admin without a wd, fall back to TL's wd_code
  IF _wd IS NULL THEN
    _wd := _tl_wd;
  END IF;

  INSERT INTO public.tl_issuances (id, wd_code, tl_user_id, issue_date, issued_by)
  VALUES (_issuance_id, _wd, _tl_user_id, _idate, auth.uid());

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _code := nullif(btrim(_item->>'material_code'), '');
    _qty := nullif(_item->>'qty', '')::integer;

    IF _code IS NULL THEN
      RAISE EXCEPTION 'Material code is required for every item';
    END IF;
    IF _qty IS NULL OR _qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be positive for material %', _code;
    END IF;
    IF _code = ANY(_seen) THEN
      RAISE EXCEPTION 'Duplicate material % in this issuance', _code;
    END IF;
    _seen := array_append(_seen, _code);

    -- Lock + check WD stock
    SELECT qty INTO _current
      FROM public.wd_stock
      WHERE wd_code = _wd AND material_code = _code
      FOR UPDATE;
    IF _current IS NULL THEN
      RAISE EXCEPTION 'No WD stock for material %', _code;
    END IF;
    IF _qty > _current THEN
      RAISE EXCEPTION 'Not enough WD stock for material % (have %, need %)', _code, _current, _qty;
    END IF;

    -- Deduct WD stock
    UPDATE public.wd_stock
      SET qty = qty - _qty, updated_at = now()
      WHERE wd_code = _wd AND material_code = _code;

    -- Insert line item
    INSERT INTO public.tl_issuance_items (issuance_id, material_code, qty_issued)
    VALUES (_issuance_id, _code, _qty);

    -- Audit trail in stock_movements (movement = 'tl_issue')
    -- wsp column is NOT NULL on stock_movements; use any wsp linked to this WD via assignments,
    -- otherwise pick the first available wsp on the assignments table for this WD.
    SELECT wsp INTO _wsp FROM public.wd_assignments WHERE wd_code = _wd LIMIT 1;
    IF _wsp IS NULL THEN
      -- Fallback: pick any wsp value (movements still need a non-null wsp).
      SELECT wsp INTO _wsp FROM public.profiles WHERE wsp IS NOT NULL LIMIT 1;
    END IF;

    INSERT INTO public.stock_movements (
      wsp, material_code, qty, movement, distributor, performed_by, dispatch_date
    ) VALUES (
      _wsp, _code, _qty, 'tl_issue', _wd, auth.uid(), _idate
    );
  END LOOP;

  RETURN _issuance_id;
END;
$$;

-- ============================================================
-- RPC: record_tl_upload
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_tl_upload(
  _issuance_item_id uuid,
  _qty integer,
  _proof_image_path text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item public.tl_issuance_items%ROWTYPE;
  _issuance public.tl_issuances%ROWTYPE;
  _is_admin boolean;
  _proof text;
  _remaining integer;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  _proof := nullif(btrim(_proof_image_path), '');
  IF _proof IS NULL THEN
    RAISE EXCEPTION 'Proof image is required';
  END IF;

  SELECT * INTO _item FROM public.tl_issuance_items
    WHERE id = _issuance_item_id FOR UPDATE;
  IF _item.id IS NULL THEN
    RAISE EXCEPTION 'Issuance item not found';
  END IF;

  SELECT * INTO _issuance FROM public.tl_issuances WHERE id = _item.issuance_id;
  IF _issuance.id IS NULL THEN
    RAISE EXCEPTION 'Parent issuance not found';
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin');
  IF NOT _is_admin AND _issuance.tl_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised to upload against this issuance';
  END IF;

  IF _qty > (_item.qty_issued - _item.qty_used) THEN
    RAISE EXCEPTION 'Cannot use more than remaining quantity (remaining: %)',
      _item.qty_issued - _item.qty_used;
  END IF;

  UPDATE public.tl_issuance_items
    SET qty_used = qty_used + _qty
    WHERE id = _issuance_item_id
    RETURNING (qty_issued - qty_used) INTO _remaining;

  INSERT INTO public.tl_uploads (issuance_item_id, qty, proof_image_path, performed_by)
  VALUES (_issuance_item_id, _qty, _proof, auth.uid());

  RETURN _remaining;
END;
$$;
