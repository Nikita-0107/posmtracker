-- Update record_wd_stock_snapshot so qty_change reflects continuous-flow accounting:
-- Used between counts = (previous_count + receipts_between_counts) - current_count
-- qty_change is stored as negative = used, positive = extra found
-- Receipts = confirmed WSP→WD dispatches (stock_movements where movement='dispatch',
--   item_status='received', distributor=WD code) created between the previous snapshot
--   and this snapshot.
CREATE OR REPLACE FUNCTION public.record_wd_stock_snapshot(
  _proof_image_path text,
  _items jsonb,
  _snapshot_date date DEFAULT CURRENT_DATE,
  _note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wd text;
  _batch uuid := gen_random_uuid();
  _item jsonb;
  _code text;
  _qty integer;
  _prev integer;
  _prev_created_at timestamptz;
  _received_between integer;
  _change integer;
BEGIN
  _wd := public.current_user_wd();
  IF _wd IS NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not assigned to a WD';
  END IF;

  IF _proof_image_path IS NULL OR length(_proof_image_path) = 0 THEN
    RAISE EXCEPTION 'Proof image is required';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _code := _item->>'material_code';
    _qty := (_item->>'qty_counted')::integer;

    IF _code IS NULL OR _qty IS NULL OR _qty < 0 THEN
      RAISE EXCEPTION 'Invalid item: %', _item;
    END IF;

    -- Last snapshot for this WD + material
    SELECT qty_counted, created_at
      INTO _prev, _prev_created_at
    FROM public.wd_stock_snapshots
    WHERE wd_code = _wd AND material_code = _code
    ORDER BY created_at DESC
    LIMIT 1;

    IF _prev IS NULL THEN
      _change := NULL; -- first count: no usage baseline yet
    ELSE
      -- Receipts confirmed between previous snapshot and now (mid-period inflow)
      SELECT COALESCE(SUM(qty), 0)
        INTO _received_between
      FROM public.stock_movements
      WHERE movement = 'dispatch'
        AND item_status = 'received'
        AND distributor = _wd
        AND material_code = _code
        AND created_at > _prev_created_at
        AND created_at <= now();

      -- qty_change = current - (previous + receipts).
      -- Negative => used; Positive => extra found vs system.
      _change := _qty - (_prev + _received_between);
    END IF;

    INSERT INTO public.wd_stock_snapshots
      (wd_code, material_code, qty_counted, qty_previous, qty_change, snapshot_date, proof_image_path, note, batch_id, created_by)
    VALUES
      (_wd, _code, _qty, _prev, _change, _snapshot_date, _proof_image_path, _note, _batch, auth.uid());
  END LOOP;

  RETURN _batch;
END;
$function$;