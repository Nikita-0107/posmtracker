-- Tighten quantity validation so neither usage nor returns can drive
-- a TL's holdings negative. Standardize the user-facing message.

CREATE OR REPLACE FUNCTION public.tl_self_used(
  _material_code text, _qty integer, _note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tl_id uuid;
  _wd text;
  _allocated integer;
  _returned integer;
  _used integer;
  _legacy_used integer;
  _balance integer;
  _id uuid := gen_random_uuid();
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  SELECT id, wd_code INTO _tl_id, _wd FROM public.wd_tls WHERE user_id = auth.uid() LIMIT 1;
  IF _tl_id IS NULL THEN
    RAISE EXCEPTION 'You are not linked to a TL profile. Ask your admin.';
  END IF;

  SELECT COALESCE(SUM(qi.qty_issued), 0), COALESCE(SUM(qi.qty_used), 0)
    INTO _allocated, _legacy_used
    FROM public.tl_issuance_items qi
    JOIN public.tl_issuances qh ON qh.id = qi.issuance_id
    WHERE qh.wd_tl_id = _tl_id AND qi.material_code = _material_code;

  SELECT COALESCE(SUM(qty), 0) INTO _returned
    FROM public.tl_returns
    WHERE wd_tl_id = _tl_id AND material_code = _material_code;

  SELECT COALESCE(SUM(qty), 0) INTO _used
    FROM public.tl_usages
    WHERE wd_tl_id = _tl_id AND material_code = _material_code;

  _balance := _allocated - _returned - _used - _legacy_used;
  IF _qty > _balance THEN
    RAISE EXCEPTION 'Entered quantity exceeds available inventory. Available: %', GREATEST(_balance, 0);
  END IF;

  INSERT INTO public.tl_usages (id, wd_code, wd_tl_id, material_code, qty, note, created_by)
  VALUES (_id, _wd, _tl_id, _material_code, _qty, nullif(btrim(_note), ''), auth.uid());

  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_from_tl(
  _wd_tl_id uuid, _items jsonb, _note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  _used integer;
  _legacy_used integer;
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

    SELECT COALESCE(SUM(qi.qty_issued), 0), COALESCE(SUM(qi.qty_used), 0)
      INTO _allocated, _legacy_used
      FROM public.tl_issuance_items qi
      JOIN public.tl_issuances qh ON qh.id = qi.issuance_id
      WHERE qh.wd_tl_id = _wd_tl_id AND qi.material_code = _code;

    SELECT COALESCE(SUM(qty), 0) INTO _returned
      FROM public.tl_returns
      WHERE wd_tl_id = _wd_tl_id AND material_code = _code;

    SELECT COALESCE(SUM(qty), 0) INTO _used
      FROM public.tl_usages
      WHERE wd_tl_id = _wd_tl_id AND material_code = _code;

    -- Current held = allocated - used - returned (used includes v1 + v2 paths)
    _pending := _allocated - _returned - _used - _legacy_used;
    IF _qty > _pending THEN
      RAISE EXCEPTION 'Entered quantity exceeds available inventory. Available for %: %', _code, GREATEST(_pending, 0);
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
$function$;

-- Standardize the per-line v1 usage error too
CREATE OR REPLACE FUNCTION public.record_tl_upload(
  _issuance_item_id uuid, _qty integer, _proof_image_path text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    RAISE EXCEPTION 'Entered quantity exceeds available inventory. Available: %',
      GREATEST(_item.qty_issued - _item.qty_used, 0);
  END IF;

  UPDATE public.tl_issuance_items
    SET qty_used = qty_used + _qty
    WHERE id = _issuance_item_id
    RETURNING (qty_issued - qty_used) INTO _remaining;

  INSERT INTO public.tl_uploads (issuance_item_id, qty, proof_image_path, performed_by)
  VALUES (_issuance_item_id, _qty, _proof, auth.uid());

  RETURN _remaining;
END;
$function$;