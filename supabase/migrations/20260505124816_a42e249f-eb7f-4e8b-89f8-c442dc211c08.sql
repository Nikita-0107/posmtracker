CREATE OR REPLACE FUNCTION public.list_manageable_users()
RETURNS TABLE(id uuid, mobile text, display_name text, wsp wsp_code, wd_code text, tl_type text, roles text[], allowed_wsps text[], created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_super boolean; _wsp_scope public.wsp_code; _wd_scope text;
  _allowed_wds text[];
BEGIN
  SELECT s.is_super, s.wsp_scope, s.wd_scope
    INTO _is_super, _wsp_scope, _wd_scope
  FROM public.user_admin_scope(auth.uid()) s;

  IF NOT _is_super AND _wsp_scope IS NULL AND _wd_scope IS NULL THEN
    RETURN;
  END IF;

  IF _wsp_scope IS NOT NULL THEN
    SELECT array_agg(wa.wd_code) INTO _allowed_wds
      FROM public.wd_assignments wa WHERE wa.wsp = _wsp_scope;
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT ur.user_id, array_agg(ur.role::text) AS roles
    FROM public.user_roles ur GROUP BY ur.user_id
  ),
  a AS (
    SELECT wa.wd_code, array_agg(wa.wsp::text) AS wsps
    FROM public.wd_assignments wa GROUP BY wa.wd_code
  )
  SELECT p.id, p.mobile, p.display_name, p.wsp, p.wd_code, p.tl_type,
         COALESCE(r.roles, ARRAY[]::text[]),
         COALESCE(a.wsps, ARRAY[]::text[]),
         p.created_at
  FROM public.profiles p
  LEFT JOIN r ON r.user_id = p.id
  LEFT JOIN a ON a.wd_code = p.wd_code
  WHERE
    _is_super
    OR (_wsp_scope IS NOT NULL AND (
         p.wsp = _wsp_scope
         OR (p.wd_code IS NOT NULL AND p.wd_code = ANY(COALESCE(_allowed_wds, ARRAY[]::text[])))
         OR COALESCE(array_length(r.roles,1),0) = 0
       ))
    OR (_wd_scope IS NOT NULL AND (
         p.wd_code = _wd_scope
         OR COALESCE(array_length(r.roles,1),0) = 0
       ))
  ORDER BY (COALESCE(array_length(r.roles,1),0) = 0) DESC, p.created_at DESC;
END;
$function$;