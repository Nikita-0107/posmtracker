
-- Backfill wd_tls.user_id and profiles.wd_code for TL accounts
UPDATE public.wd_tls t
SET user_id = p.id, updated_at = now()
FROM public.profiles p
WHERE t.user_id IS NULL
  AND p.tl_id IS NOT NULL
  AND t.legacy_tl_id IS NOT NULL
  AND p.tl_id = t.legacy_tl_id::text;

UPDATE public.profiles p
SET wd_code = t.wd_code, updated_at = now()
FROM public.wd_tls t
WHERE (p.wd_code IS NULL OR p.wd_code = '')
  AND t.user_id = p.id
  AND t.wd_code IS NOT NULL;

-- Auto-link trigger: when a profile is created/updated with a tl_id, link to wd_tls and set wd_code
CREATE OR REPLACE FUNCTION public.link_tl_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd text;
BEGIN
  IF NEW.tl_id IS NOT NULL AND NEW.tl_id <> '' THEN
    UPDATE public.wd_tls
       SET user_id = NEW.id, updated_at = now()
     WHERE legacy_tl_id::text = NEW.tl_id
       AND (user_id IS NULL OR user_id = NEW.id)
    RETURNING wd_code INTO v_wd;

    IF v_wd IS NOT NULL AND (NEW.wd_code IS NULL OR NEW.wd_code = '') THEN
      NEW.wd_code := v_wd;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_tl_profile ON public.profiles;
CREATE TRIGGER trg_link_tl_profile
BEFORE INSERT OR UPDATE OF tl_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.link_tl_profile();
