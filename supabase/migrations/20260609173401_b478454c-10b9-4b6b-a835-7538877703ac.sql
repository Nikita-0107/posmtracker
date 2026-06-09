
-- 1) Trigger: when a stock_movement is inserted with a proof_image_path,
--    set materials.image_path if it's still null.
CREATE OR REPLACE FUNCTION public.set_material_image_from_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.proof_image_path IS NOT NULL
     AND btrim(NEW.proof_image_path) <> ''
     AND NEW.movement IN ('receive','dispatch') THEN
    UPDATE public.materials
       SET image_path = NEW.proof_image_path
     WHERE code = NEW.material_code
       AND (image_path IS NULL OR btrim(image_path) = '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_material_image_from_movement ON public.stock_movements;
CREATE TRIGGER trg_set_material_image_from_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.set_material_image_from_movement();

-- 2) Backfill existing materials that have no image yet,
--    using the earliest proof image from movement history.
WITH first_proof AS (
  SELECT DISTINCT ON (material_code)
    material_code, proof_image_path
  FROM public.stock_movements
  WHERE proof_image_path IS NOT NULL
    AND btrim(proof_image_path) <> ''
    AND movement IN ('receive','dispatch')
  ORDER BY material_code, created_at ASC
)
UPDATE public.materials m
   SET image_path = fp.proof_image_path
  FROM first_proof fp
 WHERE m.code = fp.material_code
   AND (m.image_path IS NULL OR btrim(m.image_path) = '');
