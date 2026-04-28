-- WD → TL reference list (TLs are not app users)
CREATE TABLE public.wd_tls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  wd_name text,
  tl_name text NOT NULL,
  tl_type text,
  legacy_tl_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wd_code, tl_name)
);

CREATE INDEX idx_wd_tls_wd_code ON public.wd_tls(wd_code);

ALTER TABLE public.wd_tls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "WD can view own TLs"
  ON public.wd_tls FOR SELECT
  TO authenticated
  USING (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage TLs"
  ON public.wd_tls FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Link issuances to a wd_tls row instead of a user profile
ALTER TABLE public.tl_issuances
  ADD COLUMN wd_tl_id uuid REFERENCES public.wd_tls(id),
  ALTER COLUMN tl_user_id DROP NOT NULL;

-- Replace issue_to_tl: now keyed by wd_tl_id
CREATE OR REPLACE FUNCTION public.issue_to_tl_v2(_wd_tl_id uuid, _issue_date date, _items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT wd_code INTO _tl_wd FROM public.wd_tls WHERE id = _wd_tl_id;
  IF _tl_wd IS NULL THEN
    RAISE EXCEPTION 'TL not found';
  END IF;
  IF NOT _is_admin AND _tl_wd <> _wd THEN
    RAISE EXCEPTION 'Selected TL does not belong to your WD';
  END IF;

  IF _wd IS NULL THEN
    _wd := _tl_wd;
  END IF;

  INSERT INTO public.tl_issuances (id, wd_code, wd_tl_id, tl_user_id, issue_date, issued_by)
  VALUES (_issuance_id, _wd, _wd_tl_id, NULL, _idate, auth.uid());

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

    UPDATE public.wd_stock
      SET qty = qty - _qty, updated_at = now()
      WHERE wd_code = _wd AND material_code = _code;

    INSERT INTO public.tl_issuance_items (issuance_id, material_code, qty_issued)
    VALUES (_issuance_id, _code, _qty);

    SELECT wsp INTO _wsp FROM public.wd_assignments WHERE wd_code = _wd LIMIT 1;
    IF _wsp IS NULL THEN
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
$function$;