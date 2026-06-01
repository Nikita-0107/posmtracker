
-- 1. Extend dispatch item_status with pending_loss_approval
ALTER TYPE public.dispatch_item_status ADD VALUE IF NOT EXISTS 'pending_loss_approval';

-- 2. Enum for approval status (separate from concern_status for clarity)
DO $$ BEGIN
  CREATE TYPE public.loss_approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Approver predicate
CREATE OR REPLACE FUNCTION public.is_loss_approver(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_uid, 'admin')
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = _uid
        AND lower(u.email) IN (
          'satyadeosharan.nirala@itc.in',
          'umamaheswariharini.podagatlapalli@itc.in',
          'nikitabhardwaj2000@gmail.com'
        )
    )
$$;

-- 4. loss_approvals table
CREATE TABLE IF NOT EXISTS public.loss_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL REFERENCES public.stock_movements(id),
  wsp public.wsp_code NOT NULL,
  distributor text,
  material_code text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  reason text NOT NULL,
  proof_image_path text,
  submitted_by uuid NOT NULL,
  submitted_by_role text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status public.loss_approval_status NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_remarks text
);

CREATE INDEX IF NOT EXISTS loss_approvals_movement_idx ON public.loss_approvals(movement_id);
CREATE INDEX IF NOT EXISTS loss_approvals_status_idx ON public.loss_approvals(status, submitted_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.loss_approvals TO authenticated;
GRANT ALL ON public.loss_approvals TO service_role;

ALTER TABLE public.loss_approvals ENABLE ROW LEVEL SECURITY;

-- Submitter (or anyone in their WSP) can see their own; approvers see all.
CREATE POLICY "View loss approvals"
ON public.loss_approvals FOR SELECT TO authenticated
USING (
  submitted_by = auth.uid()
  OR wsp = public.current_user_wsp()
  OR public.is_loss_approver(auth.uid())
);

-- Inserts only via RPC (which uses SECURITY DEFINER); block direct inserts.
CREATE POLICY "Block direct insert"
ON public.loss_approvals FOR INSERT TO authenticated
WITH CHECK (false);

-- Updates only via RPC; block direct updates.
CREATE POLICY "Block direct update"
ON public.loss_approvals FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

-- 5. Submit a loss for approval (replaces direct accept_loss path)
CREATE OR REPLACE FUNCTION public.submit_loss_approval(
  _movement_id uuid,
  _reason text,
  _proof_image_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.stock_movements%ROWTYPE;
  _wsp public.wsp_code;
  _is_admin boolean;
  _approval_id uuid;
  _role text;
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT * INTO _row FROM public.stock_movements
    WHERE id = _movement_id AND movement = 'dispatch' FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Dispatch line not found';
  END IF;
  IF _row.item_status <> 'issue' THEN
    RAISE EXCEPTION 'Only open issue lines can be submitted for loss approval (current: %)', _row.item_status;
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin');
  SELECT wsp INTO _wsp FROM public.profiles WHERE id = auth.uid();
  IF NOT _is_admin AND (_wsp IS NULL OR _wsp <> _row.wsp) THEN
    RAISE EXCEPTION 'Not authorised to submit this loss';
  END IF;

  -- Best-effort capture submitter's role label
  SELECT string_agg(role::text, ',') INTO _role
  FROM public.user_roles WHERE user_id = auth.uid();

  INSERT INTO public.loss_approvals (
    movement_id, wsp, distributor, material_code, qty,
    reason, proof_image_path, submitted_by, submitted_by_role
  ) VALUES (
    _row.id, _row.wsp, _row.distributor, _row.material_code, _row.qty,
    trim(_reason), _proof_image_path, auth.uid(), _role
  )
  RETURNING id INTO _approval_id;

  UPDATE public.stock_movements
    SET item_status = 'pending_loss_approval'
    WHERE id = _movement_id;

  RETURN _approval_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_loss_approval(uuid, text, text) TO authenticated;

-- 6. Approve / reject a loss
CREATE OR REPLACE FUNCTION public.decide_loss_approval(
  _approval_id uuid,
  _decision text,
  _remarks text DEFAULT NULL
)
RETURNS public.loss_approval_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _appr public.loss_approvals%ROWTYPE;
  _current integer;
  _new public.loss_approval_status;
BEGIN
  IF _decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision %', _decision;
  END IF;
  IF NOT public.is_loss_approver(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to decide loss approvals';
  END IF;

  SELECT * INTO _appr FROM public.loss_approvals WHERE id = _approval_id FOR UPDATE;
  IF _appr.id IS NULL THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;
  IF _appr.status <> 'pending' THEN
    RAISE EXCEPTION 'Approval already decided (%).', _appr.status;
  END IF;

  IF _decision = 'approve' THEN
    -- Deduct WSP stock and close movement as loss
    SELECT qty INTO _current FROM public.stock
      WHERE wsp = _appr.wsp AND material_code = _appr.material_code FOR UPDATE;
    IF _current IS NULL OR _current < _appr.qty THEN
      RAISE EXCEPTION 'Not enough stock to write off (have %, need %)', coalesce(_current, 0), _appr.qty;
    END IF;
    UPDATE public.stock
      SET qty = qty - _appr.qty, updated_at = now()
      WHERE wsp = _appr.wsp AND material_code = _appr.material_code;

    UPDATE public.stock_movements
      SET item_status = 'closed_loss',
          resolved_at = now(),
          resolved_by = auth.uid()
      WHERE id = _appr.movement_id;

    _new := 'approved';
  ELSE
    -- Revert dispatch line back to open issue, no stock change
    UPDATE public.stock_movements
      SET item_status = 'issue'
      WHERE id = _appr.movement_id;
    _new := 'rejected';
  END IF;

  UPDATE public.loss_approvals
    SET status = _new,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_remarks = NULLIF(trim(coalesce(_remarks, '')), '')
    WHERE id = _approval_id;

  -- Notify submitter
  INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
  VALUES (
    _appr.submitted_by,
    CASE WHEN _new = 'approved' THEN 'loss_approved' ELSE 'loss_rejected' END,
    CASE WHEN _new = 'approved' THEN 'Loss approved' ELSE 'Loss rejected' END,
    format('%s units of %s (%s) — %s',
      _appr.qty, _appr.material_code, coalesce(_appr.distributor, '—'),
      CASE WHEN _new = 'approved' THEN 'stock deducted' ELSE 'returned to open issue' END),
    '/wsp-issues',
    _approval_id
  );

  RETURN _new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_loss_approval(uuid, text, text) TO authenticated;

-- 7. Block legacy direct accept_loss path — keep redispatch/keep_pending
CREATE OR REPLACE FUNCTION public.resolve_dispatch_issue(
  _movement_id uuid,
  _action text,
  _redispatch_qty integer DEFAULT NULL::integer,
  _proof_image_path text DEFAULT NULL::text
)
RETURNS public.dispatch_item_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF _action NOT IN ('redispatch', 'keep_pending') THEN
    RAISE EXCEPTION 'Invalid action %. Use submit_loss_approval to record a loss.', _action;
  END IF;

  SELECT * INTO _row FROM public.stock_movements
    WHERE id = _movement_id AND movement = 'dispatch' FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Dispatch line not found';
  END IF;
  IF _row.item_status <> 'issue' THEN
    RAISE EXCEPTION 'Only issue lines can be resolved (current: %)', _row.item_status;
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin');
  SELECT wsp INTO _wsp FROM public.profiles WHERE id = auth.uid();
  IF NOT _is_admin AND (_wsp IS NULL OR _wsp <> _row.wsp) THEN
    RAISE EXCEPTION 'Not authorised to resolve this issue';
  END IF;

  IF _action = 'keep_pending' THEN
    RETURN _row.item_status;
  ELSE
    _qty := COALESCE(_redispatch_qty, _row.qty);
    IF _qty <= 0 THEN
      RAISE EXCEPTION 'Re-dispatch quantity must be positive';
    END IF;
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
