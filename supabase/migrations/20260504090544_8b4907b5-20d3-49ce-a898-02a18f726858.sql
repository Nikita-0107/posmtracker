-- WD Physical Stock Snapshots: simple WD-level tracking module
CREATE TABLE public.wd_stock_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  material_code text NOT NULL,
  qty_counted integer NOT NULL CHECK (qty_counted >= 0),
  qty_previous integer,
  qty_change integer,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  proof_image_path text NOT NULL,
  note text,
  batch_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_wd_snapshots_wd_material ON public.wd_stock_snapshots(wd_code, material_code, created_at DESC);
CREATE INDEX idx_wd_snapshots_batch ON public.wd_stock_snapshots(batch_id);

ALTER TABLE public.wd_stock_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "WD view own snapshots"
ON public.wd_stock_snapshots FOR SELECT
TO authenticated
USING (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "WD create own snapshots"
ON public.wd_stock_snapshots FOR INSERT
TO authenticated
WITH CHECK (
  (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'::app_role))
  AND created_by = auth.uid()
);

-- RPC: record a batch of physical counts in one call.
-- Auto-fills qty_previous from the most recent snapshot for that (wd, material)
-- and computes qty_change = qty_counted - qty_previous.
CREATE OR REPLACE FUNCTION public.record_wd_stock_snapshot(
  _proof_image_path text,
  _items jsonb,
  _snapshot_date date DEFAULT CURRENT_DATE,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wd text;
  _batch uuid := gen_random_uuid();
  _item jsonb;
  _code text;
  _qty integer;
  _prev integer;
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
      RAISE EXCEPTION 'Invalid item: % ', _item;
    END IF;

    SELECT qty_counted INTO _prev
    FROM public.wd_stock_snapshots
    WHERE wd_code = _wd AND material_code = _code
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO public.wd_stock_snapshots
      (wd_code, material_code, qty_counted, qty_previous, qty_change, snapshot_date, proof_image_path, note, batch_id, created_by)
    VALUES
      (_wd, _code, _qty, _prev, CASE WHEN _prev IS NULL THEN NULL ELSE _qty - _prev END, _snapshot_date, _proof_image_path, _note, _batch, auth.uid());
  END LOOP;

  RETURN _batch;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_wd_stock_snapshot(text, jsonb, date, text) TO authenticated;