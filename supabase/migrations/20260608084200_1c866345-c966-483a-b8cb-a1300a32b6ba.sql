
DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;

CREATE POLICY "Service role can read tokens"
  ON public.email_unsubscribe_tokens FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can insert tokens"
  ON public.email_unsubscribe_tokens FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can mark tokens as used"
  ON public.email_unsubscribe_tokens FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;

CREATE POLICY "Service role can read suppressed emails"
  ON public.suppressed_emails FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can insert suppressed emails"
  ON public.suppressed_emails FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can delete proofs" ON storage.objects;
CREATE POLICY "Admins can delete proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'proofs' AND public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE EXECUTE ON FUNCTION public.admin_import_wd_stock(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ae_tl_team_report(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_tl_activity_report(integer) FROM PUBLIC, anon;
