-- Helper: returns the caller's admin scope
CREATE OR REPLACE FUNCTION public.user_admin_scope(_user_id uuid)
RETURNS TABLE(is_super boolean, wsp_scope public.wsp_code, wd_scope text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role),
    CASE WHEN public.has_role(_user_id, 'wsp'::public.app_role)
         THEN (SELECT wsp FROM public.profiles WHERE id = _user_id) END,
    CASE WHEN public.has_role(_user_id, 'wd'::public.app_role)
         THEN (SELECT wd_code FROM public.profiles WHERE id = _user_id) END
$$;

-- Returns users the caller is allowed to see/manage
CREATE OR REPLACE FUNCTION public.list_manageable_users()
RETURNS TABLE(
  id uuid, mobile text, display_name text,
  wsp public.wsp_code, wd_code text, tl_type text,
  roles text[], allowed_wsps text[], created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    SELECT array_agg(wd_code) INTO _allowed_wds
      FROM public.wd_assignments WHERE wsp = _wsp_scope;
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT user_id, array_agg(role::text) AS roles
    FROM public.user_roles GROUP BY user_id
  ),
  a AS (
    SELECT wd_code, array_agg(wsp::text) AS wsps
    FROM public.wd_assignments GROUP BY wd_code
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
$$;

-- Assign / change a user's primary role + assignment in one call (scope-checked)
CREATE OR REPLACE FUNCTION public.admin_assign_role(
  _target uuid,
  _role text,
  _wsp public.wsp_code,
  _wd_code text,
  _tl_type text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_super boolean; _wsp_scope public.wsp_code; _wd_scope text;
  _allowed_wds text[];
  _target_wsp public.wsp_code; _target_wd text;
  _target_is_super boolean;
BEGIN
  SELECT s.is_super, s.wsp_scope, s.wd_scope
    INTO _is_super, _wsp_scope, _wd_scope
  FROM public.user_admin_scope(auth.uid()) s;

  IF NOT _is_super AND _wsp_scope IS NULL AND _wd_scope IS NULL THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _role IS NOT NULL AND _role NOT IN ('wsp','wd','tl') THEN
    RAISE EXCEPTION 'Invalid role %', _role;
  END IF;

  _target_is_super := public.has_role(_target, 'admin'::public.app_role);
  IF _target_is_super AND NOT _is_super THEN
    RAISE EXCEPTION 'Cannot modify a Super Admin';
  END IF;

  SELECT wsp, wd_code INTO _target_wsp, _target_wd FROM public.profiles WHERE id = _target;

  IF NOT _is_super AND _wsp_scope IS NOT NULL THEN
    SELECT array_agg(wd_code) INTO _allowed_wds
      FROM public.wd_assignments WHERE wsp = _wsp_scope;
    IF _target_wsp IS NOT NULL AND _target_wsp <> _wsp_scope THEN
      RAISE EXCEPTION 'User is outside your WSP scope';
    END IF;
    IF _target_wd IS NOT NULL
       AND NOT (_target_wd = ANY(COALESCE(_allowed_wds, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'User is outside your WSP scope';
    END IF;
    IF _role = 'wsp' AND _wsp IS DISTINCT FROM _wsp_scope THEN
      RAISE EXCEPTION 'WSP Admins can only assign within WSP %', _wsp_scope;
    END IF;
    IF _role IN ('wd','tl') AND _wd_code IS NOT NULL
       AND NOT (_wd_code = ANY(COALESCE(_allowed_wds, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'WD % is not part of your WSP', _wd_code;
    END IF;
  ELSIF NOT _is_super AND _wd_scope IS NOT NULL THEN
    IF _target_wd IS NOT NULL AND _target_wd <> _wd_scope THEN
      RAISE EXCEPTION 'User is outside your WD scope';
    END IF;
    IF _role IS NOT NULL AND _role <> 'tl' THEN
      RAISE EXCEPTION 'WD Admins can only assign the TL role';
    END IF;
    IF _wd_code IS NOT NULL AND _wd_code <> _wd_scope THEN
      RAISE EXCEPTION 'WD Admins can only assign within WD %', _wd_scope;
    END IF;
  END IF;

  DELETE FROM public.user_roles
    WHERE user_id = _target AND role IN ('wsp'::public.app_role,'wd'::public.app_role,'tl'::public.app_role);
  UPDATE public.profiles SET wsp = NULL, wd_code = NULL, tl_type = NULL WHERE id = _target;

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_target, _role::public.app_role);
    UPDATE public.profiles SET
      wsp = CASE WHEN _role='wsp' THEN _wsp ELSE NULL END,
      wd_code = CASE WHEN _role IN ('wd','tl') THEN _wd_code ELSE NULL END,
      tl_type = CASE WHEN _role='tl' THEN _tl_type ELSE NULL END
    WHERE id = _target;
  END IF;
END;
$$;

-- Toggle Super Admin (Super Admin only)
CREATE OR REPLACE FUNCTION public.admin_toggle_super_admin(_target uuid, _on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only Super Admins can change Super Admin status';
  END IF;
  IF _target = auth.uid() AND NOT _on THEN
    RAISE EXCEPTION 'You cannot remove your own Super Admin status';
  END IF;
  IF _on THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_target, 'admin'::public.app_role)
      ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _target AND role = 'admin'::public.app_role;
  END IF;
END;
$$;