-- Remove hardcoded approver emails from is_loss_approver. Move approver
-- identity into a dedicated table, seeded from existing approvers.

CREATE TABLE IF NOT EXISTS public.loss_approvers (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.loss_approvers TO authenticated;
GRANT ALL ON public.loss_approvers TO service_role;

ALTER TABLE public.loss_approvers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read loss_approvers" ON public.loss_approvers;
CREATE POLICY "Authenticated can read loss_approvers"
ON public.loss_approvers FOR SELECT TO authenticated
USING (true);

-- Seed from existing hardcoded approvers via auth.users (one-time).
INSERT INTO public.loss_approvers (user_id)
SELECT u.id FROM auth.users u
WHERE lower(u.email) IN (
  'satyadeosharan.nirala@itc.in',
  'umamaheswariharini.podagatlapalli@itc.in',
  'nikitabhardwaj2000@gmail.com'
)
ON CONFLICT (user_id) DO NOTHING;

-- Replace function: no hardcoded emails, no auth.users lookup.
CREATE OR REPLACE FUNCTION public.is_loss_approver(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_uid, 'admin')
    OR EXISTS (SELECT 1 FROM public.loss_approvers WHERE user_id = _uid)
$$;

REVOKE EXECUTE ON FUNCTION public.is_loss_approver(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_loss_approver(uuid) TO authenticated, service_role;