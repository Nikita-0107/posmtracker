
-- 1) Tighten materials write policies (no more WITH CHECK true)
DROP POLICY IF EXISTS "Authenticated users can add materials" ON public.materials;
DROP POLICY IF EXISTS "Authenticated users can update materials" ON public.materials;

CREATE POLICY "Admins can add materials"
  ON public.materials FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update materials"
  ON public.materials FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Restrict wd-brand-images bucket SELECT to scoped users (replace broad policy)
DROP POLICY IF EXISTS "Authenticated read wd-brand-images" ON storage.objects;

CREATE POLICY "Scoped read wd-brand-images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'wd-brand-images'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] = public.current_user_wd()
      OR (storage.foldername(name))[1] = public.current_user_tl_wd_code()
      OR (storage.foldername(name))[1] = ANY (public.current_user_ae_wds())
    )
  );

-- 3) Revoke EXECUTE from anon (and public) on all SECURITY DEFINER functions in public schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, public;',
                   r.schema, r.name, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated;',
                   r.schema, r.name, r.args);
  END LOOP;
END $$;
