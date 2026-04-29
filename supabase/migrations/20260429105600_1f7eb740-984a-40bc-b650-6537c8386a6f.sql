-- Concerns to HO: WSP-reported stock concerns awaiting admin approval

CREATE TYPE public.concern_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.concern_reason AS ENUM ('shortage', 'damage', 'other');

CREATE TABLE public.stock_concerns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wsp public.wsp_code NOT NULL,
  material_code text NOT NULL,
  system_qty integer NOT NULL,
  actual_qty integer NOT NULL,
  difference integer NOT NULL,
  reason public.concern_reason NOT NULL,
  note text,
  proof_image_path text,
  status public.concern_status NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text
);

CREATE INDEX idx_stock_concerns_wsp ON public.stock_concerns(wsp);
CREATE INDEX idx_stock_concerns_status ON public.stock_concerns(status);

ALTER TABLE public.stock_concerns ENABLE ROW LEVEL SECURITY;

-- WSP can view their own concerns; admins can view all
CREATE POLICY "WSP view own concerns"
  ON public.stock_concerns FOR SELECT
  TO authenticated
  USING (wsp = public.current_user_wsp() OR public.has_role(auth.uid(), 'admin'));

-- WSP can submit concerns for their own WSP
CREATE POLICY "WSP create own concerns"
  ON public.stock_concerns FOR INSERT
  TO authenticated
  WITH CHECK (wsp = public.current_user_wsp() AND created_by = auth.uid());

-- Only admins can update (resolve) concerns
CREATE POLICY "Admins resolve concerns"
  ON public.stock_concerns FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RPC: submit a concern
CREATE OR REPLACE FUNCTION public.submit_stock_concern(
  _material_code text,
  _actual_qty integer,
  _reason public.concern_reason,
  _note text DEFAULT NULL,
  _proof_image_path text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _wsp public.wsp_code;
  _system integer;
  _id uuid;
BEGIN
  IF _actual_qty IS NULL OR _actual_qty < 0 THEN
    RAISE EXCEPTION 'Actual quantity must be zero or positive';
  END IF;

  SELECT wsp INTO _wsp FROM public.profiles WHERE id = auth.uid();
  IF _wsp IS NULL THEN
    RAISE EXCEPTION 'No WSP assigned to your account';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materials WHERE code = _material_code) THEN
    RAISE EXCEPTION 'Material % does not exist', _material_code;
  END IF;

  SELECT qty INTO _system FROM public.stock
    WHERE wsp = _wsp AND material_code = _material_code;
  _system := COALESCE(_system, 0);

  INSERT INTO public.stock_concerns (
    wsp, material_code, system_qty, actual_qty, difference,
    reason, note, proof_image_path, created_by
  ) VALUES (
    _wsp, _material_code, _system, _actual_qty, _actual_qty - _system,
    _reason, nullif(btrim(_note), ''), nullif(btrim(_proof_image_path), ''), auth.uid()
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- RPC: admin resolves a concern (approve adjusts stock to actual_qty; reject leaves stock unchanged)
CREATE OR REPLACE FUNCTION public.resolve_stock_concern(
  _concern_id uuid,
  _action text,
  _resolution_note text DEFAULT NULL
) RETURNS public.concern_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row public.stock_concerns%ROWTYPE;
  _current integer;
  _diff integer;
  _new_status public.concern_status;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can resolve concerns';
  END IF;
  IF _action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action %', _action;
  END IF;

  SELECT * INTO _row FROM public.stock_concerns
    WHERE id = _concern_id FOR UPDATE;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Concern not found';
  END IF;
  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'Concern is already %', _row.status;
  END IF;

  IF _action = 'approve' THEN
    SELECT qty INTO _current FROM public.stock
      WHERE wsp = _row.wsp AND material_code = _row.material_code FOR UPDATE;
    _current := COALESCE(_current, 0);
    _diff := _row.actual_qty - _current; -- adjust to actual

    IF _diff <> 0 THEN
      INSERT INTO public.stock (wsp, material_code, qty, updated_at)
      VALUES (_row.wsp, _row.material_code, GREATEST(_row.actual_qty, 0), now())
      ON CONFLICT (wsp, material_code) DO UPDATE
        SET qty = GREATEST(_row.actual_qty, 0), updated_at = now();
    END IF;
    _new_status := 'approved';
  ELSE
    _new_status := 'rejected';
  END IF;

  UPDATE public.stock_concerns
    SET status = _new_status,
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_note = nullif(btrim(_resolution_note), '')
    WHERE id = _concern_id;

  RETURN _new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_stock_concern(text, integer, public.concern_reason, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_stock_concern(text, integer, public.concern_reason, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_stock_concern(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stock_concern(uuid, text, text) TO authenticated;