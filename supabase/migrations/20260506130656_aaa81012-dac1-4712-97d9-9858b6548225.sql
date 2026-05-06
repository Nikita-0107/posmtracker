
-- 1. Dedupe primary roles per user. Priority: wsp_admin > wd_admin > wsp > tl > wd
WITH ranked AS (
  SELECT id, user_id, role,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY CASE role::text
        WHEN 'wsp_admin' THEN 1
        WHEN 'wd_admin' THEN 2
        WHEN 'wsp' THEN 3
        WHEN 'tl' THEN 4
        WHEN 'wd' THEN 5
        ELSE 99
      END
    ) AS rn
  FROM public.user_roles
  WHERE role::text IN ('wsp_admin','wd_admin','wsp','wd','tl')
)
DELETE FROM public.user_roles ur
USING ranked r
WHERE ur.id = r.id AND r.rn > 1;

-- 2. Remove orphan wd_tls rows for users who now have an elevated role
DELETE FROM public.wd_tls wt
WHERE wt.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = wt.user_id
      AND ur.role::text IN ('wsp_admin','wd_admin','wsp','wd')
  );

-- 3. Harden tl_submit_setup so it refuses to create a TL row for someone with an elevated role
CREATE OR REPLACE FUNCTION public.tl_submit_setup(_legacy_tl_id integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row_id uuid;
  _name text;
  _mobile text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _legacy_tl_id IS NULL OR _legacy_tl_id <= 0 THEN
    RAISE EXCEPTION 'A valid TL ID is required';
  END IF;
  IF NOT public.has_role(_uid, 'tl'::public.app_role) THEN
    RAISE EXCEPTION 'Only TL users can complete TL setup';
  END IF;

  -- Refuse if user holds any elevated role
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role::text IN ('admin','wsp_admin','wd_admin','wsp','wd')
  ) THEN
    RAISE EXCEPTION 'User already has an elevated role; TL setup not applicable';
  END IF;

  SELECT id INTO _row_id FROM public.wd_tls WHERE user_id = _uid LIMIT 1;
  IF _row_id IS NOT NULL THEN
    UPDATE public.wd_tls
       SET legacy_tl_id = _legacy_tl_id, updated_at = now()
     WHERE id = _row_id;
    RETURN _row_id;
  END IF;

  SELECT display_name, mobile INTO _name, _mobile FROM public.profiles WHERE id = _uid;

  SELECT id INTO _row_id
    FROM public.wd_tls
   WHERE legacy_tl_id = _legacy_tl_id AND user_id IS NULL
   ORDER BY (wd_code IS NULL), created_at
   LIMIT 1
   FOR UPDATE;

  IF _row_id IS NOT NULL THEN
    UPDATE public.wd_tls
       SET user_id = _uid,
           tl_name = COALESCE(_name, tl_name),
           updated_at = now()
     WHERE id = _row_id;
    RETURN _row_id;
  END IF;

  INSERT INTO public.wd_tls (user_id, legacy_tl_id, tl_name, wd_code)
  VALUES (_uid, _legacy_tl_id, COALESCE(_name, 'TL ' || _mobile), NULL)
  RETURNING id INTO _row_id;

  RETURN _row_id;
END;
$function$;
