
-- Add reference image columns to materials master
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS image_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS image_updated_at TIMESTAMPTZ NULL;

-- Allow any authenticated user to update materials (only used to set image_path in practice)
DROP POLICY IF EXISTS "Authenticated users can update materials" ON public.materials;
CREATE POLICY "Authenticated users can update materials"
  ON public.materials
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Storage RLS for material reference images under proofs/material-images/*
DROP POLICY IF EXISTS "Auth read material images" ON storage.objects;
CREATE POLICY "Auth read material images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'proofs' AND (storage.foldername(name))[1] = 'material-images');

DROP POLICY IF EXISTS "Auth insert material images" ON storage.objects;
CREATE POLICY "Auth insert material images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proofs' AND (storage.foldername(name))[1] = 'material-images');

DROP POLICY IF EXISTS "Auth update material images" ON storage.objects;
CREATE POLICY "Auth update material images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'proofs' AND (storage.foldername(name))[1] = 'material-images')
  WITH CHECK (bucket_id = 'proofs' AND (storage.foldername(name))[1] = 'material-images');
