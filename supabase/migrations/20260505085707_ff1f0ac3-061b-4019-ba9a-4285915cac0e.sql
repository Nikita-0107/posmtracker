-- Link TLs (wd_tls) to authenticated users so TLs can self-allocate / self-return
ALTER TABLE public.wd_tls
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS wd_tls_user_id_key
  ON public.wd_tls(user_id) WHERE user_id IS NOT NULL;

-- Helper: which wd_tls.id belongs to the current auth user
CREATE OR REPLACE FUNCTION public.current_user_wd_tl_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.wd_tls WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_tl_wd_code()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wd_code FROM public.wd_tls WHERE user_id = auth.uid() LIMIT 1
$$;

-- Allow a logged-in TL to read their own wd_tls row (admins already have via "Admins manage TLs"; WD already via "WD can view own TLs")
DROP POLICY IF EXISTS "TL can view own wd_tls row" ON public.wd_tls;
CREATE POLICY "TL can view own wd_tls row" ON public.wd_tls
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Allow a logged-in TL to read wd_stock for their assigned WD (so the TL portal can show available stock)
DROP POLICY IF EXISTS "TL can view stock of own WD" ON public.wd_stock;
CREATE POLICY "TL can view stock of own WD" ON public.wd_stock
  FOR SELECT TO authenticated
  USING (wd_code = public.current_user_tl_wd_code());

-- Allow TL to view their own issuances / returns (issuances policy already covers tl_user_id; add wd_tl_id-based policies for self-allocations created by TL)
DROP POLICY IF EXISTS "TL view own issuances by wd_tl_id" ON public.tl_issuances;
CREATE POLICY "TL view own issuances by wd_tl_id" ON public.tl_issuances
  FOR SELECT TO authenticated
  USING (wd_tl_id = public.current_user_wd_tl_id());

DROP POLICY IF EXISTS "TL view own returns" ON public.tl_returns;
CREATE POLICY "TL view own returns" ON public.tl_returns
  FOR SELECT TO authenticated
  USING (wd_tl_id = public.current_user_wd_tl_id());

-- TL self-allocation RPC: TL takes one material at a time
CREATE OR REPLACE FUNCTION public.tl_self_take(_material_code text, _qty integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tl_id uuid;
  _wd text;
  _current integer;
  _issuance_id uuid := gen_random_uuid();
  _wsp public.wsp_code;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;
  IF _material_code IS NULL OR btrim(_material_code) = '' THEN
    RAISE EXCEPTION 'Material is required';
  END IF;

  SELECT id, wd_code INTO _tl_id, _wd FROM public.wd_tls WHERE user_id = auth.uid() LIMIT 1;
  IF _tl_id IS NULL THEN
    RAISE EXCEPTION 'You are not linked to a TL profile. Ask your admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE code = _material_code) THEN
    RAISE EXCEPTION 'Material % does not exist', _material_code;
  END IF;

  SELECT qty INTO _current FROM public.wd_stock
    WHERE wd_code = _wd AND material_code = _material_code FOR UPDATE;
  IF _current IS NULL THEN
    RAISE EXCEPTION 'No WD stock for material %', _material_code;
  END IF;
  IF _qty > _current THEN
    RAISE EXCEPTION 'Not enough WD stock (available %, requested %)', _current, _qty;
  END IF;

  UPDATE public.wd_stock
    SET qty = qty - _qty, updated_at = now()
    WHERE wd_code = _wd AND material_code = _material_code;

  INSERT INTO public.tl_issuances (id, wd_code, wd_tl_id, tl_user_id, issue_date, issued_by)
  VALUES (_issuance_id, _wd, _tl_id, auth.uid(), current_date, auth.uid());

  INSERT INTO public.tl_issuance_items (issuance_id, material_code, qty_issued)
  VALUES (_issuance_id, _material_code, _qty);

  -- Mirror to stock_movements for reporting
  SELECT wsp INTO _wsp FROM public.wd_assignments WHERE wd_code = _wd LIMIT 1;
  IF _wsp IS NULL THEN
    SELECT wsp INTO _wsp FROM public.profiles WHERE wsp IS NOT NULL LIMIT 1;
  END IF;
  IF _wsp IS NOT NULL THEN
    INSERT INTO public.stock_movements (
      wsp, material_code, qty, movement, distributor, performed_by, dispatch_date
    ) VALUES (
      _wsp, _material_code, _qty, 'tl_issue', _wd, auth.uid(), current_date
    );
  END IF;

  RETURN _issuance_id;
END;
$$;

-- TL self-return RPC
CREATE OR REPLACE FUNCTION public.tl_self_return(_material_code text, _qty integer, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tl_id uuid;
  _wd text;
  _allocated integer;
  _returned integer;
  _pending integer;
  _batch uuid := gen_random_uuid();
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  SELECT id, wd_code INTO _tl_id, _wd FROM public.wd_tls WHERE user_id = auth.uid() LIMIT 1;
  IF _tl_id IS NULL THEN
    RAISE EXCEPTION 'You are not linked to a TL profile. Ask your admin.';
  END IF;

  SELECT COALESCE(SUM(qi.qty_issued), 0) INTO _allocated
    FROM public.tl_issuance_items qi
    JOIN public.tl_issuances qh ON qh.id = qi.issuance_id
    WHERE qh.wd_tl_id = _tl_id AND qi.material_code = _material_code;

  SELECT COALESCE(SUM(qty), 0) INTO _returned
    FROM public.tl_returns
    WHERE wd_tl_id = _tl_id AND material_code = _material_code;

  _pending := _allocated - _returned;
  IF _qty > _pending THEN
    RAISE EXCEPTION 'Return (%) exceeds your pending (%)', _qty, _pending;
  END IF;

  INSERT INTO public.tl_returns (wd_code, wd_tl_id, material_code, qty, batch_id, note, created_by)
  VALUES (_wd, _tl_id, _material_code, _qty, _batch, nullif(btrim(_note), ''), auth.uid());

  INSERT INTO public.wd_stock (wd_code, material_code, qty, updated_at)
  VALUES (_wd, _material_code, _qty, now())
  ON CONFLICT (wd_code, material_code) DO UPDATE
    SET qty = public.wd_stock.qty + EXCLUDED.qty, updated_at = now();

  RETURN _batch;
END;
$$;

-- Allow admins to update wd_tls.user_id linkage explicitly (already covered by "Admins manage TLs" ALL policy; no-op safeguard)