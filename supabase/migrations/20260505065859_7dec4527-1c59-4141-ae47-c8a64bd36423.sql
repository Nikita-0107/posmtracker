
-- Track marked reasons for TL inactivity
CREATE TABLE public.tl_inactivity_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_tl_id uuid NOT NULL,
  wd_code text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('on_leave','no_requirement','stock_sufficient','other')),
  comment text,
  leave_until date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX idx_tl_inactivity_tl ON public.tl_inactivity_reasons(wd_tl_id, created_at DESC);

ALTER TABLE public.tl_inactivity_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "WD view own inactivity reasons"
  ON public.tl_inactivity_reasons FOR SELECT
  TO authenticated
  USING (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "WD insert own inactivity reasons"
  ON public.tl_inactivity_reasons FOR INSERT
  TO authenticated
  WITH CHECK (
    (wd_code = public.current_user_wd() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    AND created_by = auth.uid()
  );
