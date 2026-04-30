-- Allow WD users to upload proof images under their wd_code folder
CREATE POLICY "WD can upload proofs under their wd_code"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proofs'
  AND (storage.foldername(name))[1] = public.current_user_wd()
);

-- Allow WD users to view proof images under their wd_code folder (for closure proofs, etc.)
CREATE POLICY "WD can view proofs under their wd_code"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proofs'
  AND (
    (storage.foldername(name))[1] = public.current_user_wd()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);