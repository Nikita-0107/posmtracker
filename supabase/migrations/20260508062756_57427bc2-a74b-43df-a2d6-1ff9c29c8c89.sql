
-- Table for brand-wise stock verification images (latest per wd+brand)
CREATE TABLE public.wd_brand_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wd_code text NOT NULL,
  brand text NOT NULL,
  image_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wd_code, brand)
);

ALTER TABLE public.wd_brand_images ENABLE ROW LEVEL SECURITY;

-- AE can manage images for their WDs
CREATE POLICY "AE manages wd_brand_images"
  ON public.wd_brand_images FOR ALL TO authenticated
  USING (wd_code = ANY (current_user_ae_wds()))
  WITH CHECK (wd_code = ANY (current_user_ae_wds()) AND uploaded_by = auth.uid());

-- Admin manages all
CREATE POLICY "Admins manage wd_brand_images"
  ON public.wd_brand_images FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- WD can view its own
CREATE POLICY "WD view wd_brand_images"
  ON public.wd_brand_images FOR SELECT TO authenticated
  USING (wd_code = current_user_wd());

-- TL can view images for their WD
CREATE POLICY "TL view wd_brand_images"
  ON public.wd_brand_images FOR SELECT TO authenticated
  USING (wd_code = current_user_tl_wd_code());

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('wd-brand-images', 'wd-brand-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: anyone authenticated can read (bucket is public anyway).
CREATE POLICY "Authenticated read wd-brand-images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wd-brand-images');

-- AE can upload to wd-brand-images for their WDs (path starts with wd_code/)
CREATE POLICY "AE upload wd-brand-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'wd-brand-images'
    AND (storage.foldername(name))[1] = ANY (current_user_ae_wds())
  );

CREATE POLICY "AE update wd-brand-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'wd-brand-images'
    AND (storage.foldername(name))[1] = ANY (current_user_ae_wds())
  );

CREATE POLICY "AE delete wd-brand-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'wd-brand-images'
    AND (storage.foldername(name))[1] = ANY (current_user_ae_wds())
  );

CREATE POLICY "Admin manage wd-brand-images"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'wd-brand-images' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'wd-brand-images' AND has_role(auth.uid(), 'admin'::app_role));
