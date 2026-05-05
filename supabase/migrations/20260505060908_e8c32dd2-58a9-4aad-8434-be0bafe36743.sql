CREATE TABLE public.tl_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  wd_tl_id uuid NOT NULL,
  material_code text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  batch_id uuid NOT NULL,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tl_returns_tl ON public.tl_returns(wd_tl_id, material_code);
CREATE INDEX idx_tl_returns_wd ON public.tl_returns(wd_code, created_at DESC);

ALTER TABLE public.tl_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "WD view own returns"
  ON public.tl_returns FOR SELECT TO authenticated
  USING (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "WD insert own returns"
  ON public.tl_returns FOR INSERT TO authenticated
  WITH CHECK (
    (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    AND created_by = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.return_from_tl(
  _wd_tl_id uuid,
  _items jsonb,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wd text;
  _is_admin boolean;
  _tl_wd text;
  _batch uuid := gen_random_uuid();
  _item jsonb;
  _code text;
  _qty integer;
  _allocated integer;
  _returned integer;
  _pending integer;
  _seen text[] := ARRAY[]::text[];
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  _wd := public.current_user_wd();
  IF NOT _is_admin AND _wd IS NULL THEN
    RAISE EXCEPTION 'No WD code on your account';
  END IF;

  SELECT wd_code INTO _tl_wd FROM public.wd_tls WHERE id = _wd_tl_id;
  IF _tl_wd IS NULL THEN RAISE EXCEPTION 'TL not found'; END IF;
  IF NOT _is_admin AND _tl_wd <> _wd THEN
    RAISE EXCEPTION 'TL does not belong to your WD';
  END IF;
  IF _wd IS NULL THEN _wd := _tl_wd; END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _code := nullif(btrim(_item->>'material_code'), '');
    _qty := nullif(_item->>'qty', '')::integer;
    IF _code IS NULL THEN RAISE EXCEPTION 'Material code required for every item'; END IF;
    IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity must be positive for %', _code; END IF;
    IF _code = ANY(_seen) THEN RAISE EXCEPTION 'Duplicate material % in this return', _code; END IF;
    _seen := array_append(_seen, _code);

    -- Pending = all-time allocated to this TL minus all-time returned
    SELECT COALESCE(SUM(qi.qty_issued), 0) INTO _allocated
      FROM public.tl_issuance_items qi
      JOIN public.tl_issuances qh ON qh.id = qi.issuance_id
      WHERE qh.wd_tl_id = _wd_tl_id AND qi.material_code = _code;

    SELECT COALESCE(SUM(qty), 0) INTO _returned
      FROM public.tl_returns
      WHERE wd_tl_id = _wd_tl_id AND material_code = _code;

    _pending := _allocated - _returned;
    IF _qty > _pending THEN
      RAISE EXCEPTION 'Return (%) exceeds pending (%) for %', _qty, _pending, _code;
    END IF;

    INSERT INTO public.tl_returns (wd_code, wd_tl_id, material_code, qty, batch_id, note, created_by)
    VALUES (_wd, _wd_tl_id, _code, _qty, _batch, nullif(btrim(_note), ''), auth.uid());

    INSERT INTO public.wd_stock (wd_code, material_code, qty, updated_at)
    VALUES (_wd, _code, _qty, now())
    ON CONFLICT (wd_code, material_code) DO UPDATE
      SET qty = public.wd_stock.qty + EXCLUDED.qty, updated_at = now();
  END LOOP;

  RETURN _batch;
END;
$$;