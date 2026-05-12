CREATE TABLE IF NOT EXISTS public.tl_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  wd_tl_id uuid NOT NULL,
  material_code text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tl_usages_tl_mat_idx
  ON public.tl_usages(wd_tl_id, material_code);

ALTER TABLE public.tl_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TL view own usages" ON public.tl_usages;
CREATE POLICY "TL view own usages" ON public.tl_usages
  FOR SELECT TO authenticated
  USING (wd_tl_id = public.current_user_wd_tl_id());

DROP POLICY IF EXISTS "WD view own usages" ON public.tl_usages;
CREATE POLICY "WD view own usages" ON public.tl_usages
  FOR SELECT TO authenticated
  USING ((wd_code = public.current_user_wd()) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "AE views tl_usages" ON public.tl_usages;
CREATE POLICY "AE views tl_usages" ON public.tl_usages
  FOR SELECT TO authenticated
  USING (wd_code = ANY (public.current_user_ae_wds()));

DROP POLICY IF EXISTS "Admins manage tl_usages" ON public.tl_usages;
CREATE POLICY "Admins manage tl_usages" ON public.tl_usages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tl_self_used(_material_code text, _qty integer, _note text DEFAULT NULL)
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
  _used integer;
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

  SELECT COALESCE(SUM(qi.qty_issued), 0) INTO _allocated
    FROM public.tl_issuance_items qi
    JOIN public.tl_issuances qh ON qh.id = qi.issuance_id
    WHERE qh.wd_tl_id = _tl_id AND qi.material_code = _material_code;

  SELECT COALESCE(SUM(qty), 0) INTO _returned
    FROM public.tl_returns
    WHERE wd_tl_id = _tl_id AND material_code = _material_code;

  SELECT COALESCE(SUM(qty), 0) INTO _used
    FROM public.tl_usages
    WHERE wd_tl_id = _tl_id AND material_code = _material_code;

  _balance := _allocated - _returned - _used;
  IF _qty > _balance THEN
    RAISE EXCEPTION 'Mark used (%) exceeds your current balance (%)', _qty, _balance;
  END IF;

  INSERT INTO public.tl_usages (id, wd_code, wd_tl_id, material_code, qty, note, created_by)
  VALUES (_id, _wd, _tl_id, _material_code, _qty, nullif(btrim(_note), ''), auth.uid());

  RETURN _id;
END;
$$;