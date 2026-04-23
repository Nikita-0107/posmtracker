-- Add resolution tracking columns to stock_movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

-- Allow the WSP that performed a dispatch (or admin) to update its rows.
-- Needed so the resolve RPC can update item_status / resolution fields under RLS.
DROP POLICY IF EXISTS "WSP can update own dispatch lines" ON public.stock_movements;
CREATE POLICY "WSP can update own dispatch lines"
  ON public.stock_movements
  FOR UPDATE
  TO authenticated
  USING ((wsp = current_user_wsp()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((wsp = current_user_wsp()) OR has_role(auth.uid(), 'admin'::app_role));

-- WSP issue-resolution RPC
CREATE OR REPLACE FUNCTION public.resolve_dispatch_issue(
  _movement_id uuid,
  _action text,           -- 'accept_loss' | 'redispatch' | 'keep_pending'
  _redispatch_qty integer DEFAULT NULL,
  _proof_image_path text DEFAULT NULL
) RETURNS public.dispatch_item_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.stock_movements%ROWTYPE;
  _wsp public.wsp_code;
  _is_admin boolean;
  _new_status public.dispatch_item_status;
  _current integer;
  _qty integer;
  _new_dispatch_id uuid;
BEGIN
  IF _action NOT IN ('accept_loss', 'redispatch', 'keep_pending') THEN
    RAISE EXCEPTION 'Invalid action %', _action;
  END IF;

  SELECT * INTO _row FROM public.stock_movements
    WHERE id = _movement_id AND movement = 'dispatch'
    FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Dispatch line not found';
  END IF;
  IF _row.item_status <> 'issue' THEN
    RAISE EXCEPTION 'Only issue lines can be resolved (current: %)', _row.item_status;
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin');
  SELECT wsp INTO _wsp FROM public.profiles WHERE id = auth.uid();

  IF NOT _is_admin THEN
    IF _wsp IS NULL OR _wsp <> _row.wsp THEN
      RAISE EXCEPTION 'Not authorised to resolve this issue';
    END IF;
  END IF;

  IF _action = 'keep_pending' THEN
    -- Explicit no-op; just return the current status unchanged.
    RETURN _row.item_status;
  ELSIF _action = 'accept_loss' THEN
    -- Permanently deduct from WSP stock and close as loss.
    SELECT qty INTO _current FROM public.stock
      WHERE wsp = _row.wsp AND material_code = _row.material_code
      FOR UPDATE;
    IF _current IS NULL OR _current < _row.qty THEN
      RAISE EXCEPTION 'Not enough stock to write off (have %, need %)', coalesce(_current, 0), _row.qty;
    END IF;
    UPDATE public.stock
      SET qty = qty - _row.qty, updated_at = now()
      WHERE wsp = _row.wsp AND material_code = _row.material_code;

    _new_status := 'closed_loss';
  ELSIF _action = 'redispatch' THEN
    _qty := COALESCE(_redispatch_qty, _row.qty);
    IF _qty <= 0 THEN
      RAISE EXCEPTION 'Re-dispatch quantity must be positive';
    END IF;
    -- Validate available stock (current - currently in-transit pending) >= new qty
    SELECT qty INTO _current FROM public.stock
      WHERE wsp = _row.wsp AND material_code = _row.material_code;
    IF _current IS NULL THEN
      RAISE EXCEPTION 'No stock for material %', _row.material_code;
    END IF;
    IF _qty > _current - COALESCE((
      SELECT SUM(qty) FROM public.stock_movements
      WHERE wsp = _row.wsp
        AND material_code = _row.material_code
        AND movement = 'dispatch'
        AND item_status = 'pending'
    ), 0) THEN
      RAISE EXCEPTION 'Not enough available stock to re-dispatch';
    END IF;

    _new_dispatch_id := gen_random_uuid();
    INSERT INTO public.stock_movements (
      wsp, material_code, qty, movement, distributor, performed_by,
      proof_image_path, dispatch_id, dispatch_date, item_status
    ) VALUES (
      _row.wsp, _row.material_code, _qty, 'dispatch', _row.distributor, auth.uid(),
      COALESCE(_proof_image_path, _row.proof_image_path), _new_dispatch_id, current_date, 'pending'
    );

    _new_status := 'resolved';
  END IF;

  UPDATE public.stock_movements
    SET item_status = _new_status,
        resolved_at = now(),
        resolved_by = auth.uid()
    WHERE id = _movement_id;

  RETURN _new_status;
END;
$$;
