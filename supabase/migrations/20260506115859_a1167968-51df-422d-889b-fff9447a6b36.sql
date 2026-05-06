CREATE OR REPLACE FUNCTION public.list_manageable_users()
 RETURNS TABLE(id uuid, mobile text, display_name text, wsp wsp_code, wd_code text, tl_type text, roles text[], allowed_wsps text[], ae_wds text[], created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_super boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
  _wsp_scope public.wsp_code;
  _wd_scope text;
BEGIN
  SELECT s.wsp_scope, s.wd_scope INTO _wsp_scope, _wd_scope
  FROM public.user_admin_scope(auth.uid()) s;

  RETURN QUERY
  WITH r AS (
    SELECT ur.user_id, array_agg(ur.role::text) AS roles
    FROM public.user_roles ur GROUP BY ur.user_id
  ),
  a AS (
    SELECT wa.wd_code AS wdc, array_agg(wa.wsp::text) AS wsps
    FROM public.wd_assignments wa GROUP BY wa.wd_code
  ),
  ae AS (
    SELECT aa.ae_user_id AS uid, array_agg(aa.wd_code) AS wds
    FROM public.ae_assignments aa GROUP BY aa.ae_user_id
  )
  SELECT p.id, p.mobile, p.display_name, p.wsp, p.wd_code, p.tl_type,
         COALESCE(r.roles, ARRAY[]::text[]),
         COALESCE(a.wsps, ARRAY[]::text[]),
         COALESCE(ae.wds, ARRAY[]::text[]),
         p.created_at
  FROM public.profiles p
  LEFT JOIN r ON r.user_id = p.id
  LEFT JOIN a ON a.wdc = p.wd_code
  LEFT JOIN ae ON ae.uid = p.id
  WHERE _is_super
     OR (_wsp_scope IS NOT NULL AND (p.wsp = _wsp_scope OR _wsp_scope::text = ANY(COALESCE(a.wsps, ARRAY[]::text[]))))
     OR (_wd_scope IS NOT NULL AND p.wd_code = _wd_scope)
  ORDER BY p.created_at DESC NULLS LAST;
END
$function$;