-- Convert all WD User role assignments to TL User
-- Avoid duplicates if user already has tl role
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'tl'::app_role
FROM public.user_roles ur
WHERE ur.role = 'wd'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'tl'
  );

DELETE FROM public.user_roles WHERE role = 'wd';