
-- Allow delegated TL receivers to insert/update wd_brand_images for their assigned WD
CREATE POLICY "TL receiver insert wd_brand_images"
ON public.wd_brand_images
FOR INSERT
TO authenticated
WITH CHECK (
  current_user_tl_is_wd_receiver()
  AND wd_code = current_user_tl_wd_code()
  AND uploaded_by = auth.uid()
);

CREATE POLICY "TL receiver update wd_brand_images"
ON public.wd_brand_images
FOR UPDATE
TO authenticated
USING (
  current_user_tl_is_wd_receiver()
  AND wd_code = current_user_tl_wd_code()
)
WITH CHECK (
  current_user_tl_is_wd_receiver()
  AND wd_code = current_user_tl_wd_code()
);

-- Allow delegated TL receivers to upload/update images in the wd-brand-images storage bucket
-- for their assigned WD (folder name = wd_code)
CREATE POLICY "TL receiver upload wd-brand-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wd-brand-images'
  AND current_user_tl_is_wd_receiver()
  AND (storage.foldername(name))[1] = current_user_tl_wd_code()
);

CREATE POLICY "TL receiver update wd-brand-images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'wd-brand-images'
  AND current_user_tl_is_wd_receiver()
  AND (storage.foldername(name))[1] = current_user_tl_wd_code()
);
