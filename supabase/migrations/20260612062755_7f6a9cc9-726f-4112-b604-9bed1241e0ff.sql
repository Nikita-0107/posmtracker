DROP TRIGGER IF EXISTS trg_set_material_image_from_movement ON public.stock_movements;
DROP FUNCTION IF EXISTS public.set_material_image_from_movement();

-- Clear material image_path values that were auto-populated from proof images
-- (genuine Material Image uploads set image_updated_at; the trigger never did)
UPDATE public.materials
SET image_path = NULL
WHERE image_path IS NOT NULL
  AND image_updated_at IS NULL;