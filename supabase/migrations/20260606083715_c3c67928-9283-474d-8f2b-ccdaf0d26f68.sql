CREATE TABLE public.password_reset_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id uuid NOT NULL,
  target_login_id text NOT NULL,
  reset_by uuid NOT NULL,
  reset_by_login_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.password_reset_audit TO authenticated;
GRANT ALL ON public.password_reset_audit TO service_role;

ALTER TABLE public.password_reset_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view password reset audit"
  ON public.password_reset_audit
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));