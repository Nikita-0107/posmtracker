ALTER TABLE public.wd_brand_images ADD COLUMN IF NOT EXISTS no_stock boolean NOT NULL DEFAULT false;
ALTER TABLE public.wd_brand_images ALTER COLUMN image_path DROP NOT NULL;