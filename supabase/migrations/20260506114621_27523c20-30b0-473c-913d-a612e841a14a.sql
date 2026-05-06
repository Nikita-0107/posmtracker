
DROP FUNCTION IF EXISTS public.user_admin_scope(uuid);
DROP FUNCTION IF EXISTS public.list_manageable_users();
DROP FUNCTION IF EXISTS public.admin_assign_role(uuid, text, public.wsp_code, text, text);

-- 1) ae_assignments: AE (wd_admin) -> many WDs
CREATE TABLE IF NOT EXISTS public.ae_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ae_user_id uuid NOT NULL,
  wd_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ae_user_id, wd_code)
);
CREATE INDEX IF NOT EXISTS ae_assignments_user_idx ON public.ae_assignments(ae_user_id);
CREATE INDEX IF NOT EXISTS ae_assignments_wd_idx ON public.ae_assignments(wd_code);

ALTER TABLE public.ae_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AE views own assignments" ON public.ae_assignments;
CREATE POLICY "AE views own assignments" ON public.ae_assignments
  FOR SELECT TO authenticated
  USING (ae_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage AE assignments" ON public.ae_assignments;
CREATE POLICY "Admins manage AE assignments" ON public.ae_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.current_user_ae_wds()
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(wd_code), ARRAY[]::text[])
  FROM public.ae_assignments
  WHERE ae_user_id = auth.uid();
$$;

DROP POLICY IF EXISTS "AE views WD stock" ON public.wd_stock;
CREATE POLICY "AE views WD stock" ON public.wd_stock
  FOR SELECT TO authenticated
  USING (wd_code = ANY(public.current_user_ae_wds()));

DROP POLICY IF EXISTS "AE views wd_tls" ON public.wd_tls;
CREATE POLICY "AE views wd_tls" ON public.wd_tls
  FOR SELECT TO authenticated
  USING (wd_code = ANY(public.current_user_ae_wds()));

DROP POLICY IF EXISTS "AE manages wd_tls" ON public.wd_tls;
CREATE POLICY "AE manages wd_tls" ON public.wd_tls
  FOR ALL TO authenticated
  USING (wd_code = ANY(public.current_user_ae_wds()))
  WITH CHECK (wd_code = ANY(public.current_user_ae_wds()));

DROP POLICY IF EXISTS "AE views tl_issuances" ON public.tl_issuances;
CREATE POLICY "AE views tl_issuances" ON public.tl_issuances
  FOR SELECT TO authenticated
  USING (wd_code = ANY(public.current_user_ae_wds()));

DROP POLICY IF EXISTS "AE creates tl_issuances" ON public.tl_issuances;
CREATE POLICY "AE creates tl_issuances" ON public.tl_issuances
  FOR INSERT TO authenticated
  WITH CHECK (wd_code = ANY(public.current_user_ae_wds()));

DROP POLICY IF EXISTS "AE views tl_issuance_items" ON public.tl_issuance_items;
CREATE POLICY "AE views tl_issuance_items" ON public.tl_issuance_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tl_issuances i
    WHERE i.id = tl_issuance_items.issuance_id
      AND i.wd_code = ANY(public.current_user_ae_wds())
  ));

DROP POLICY IF EXISTS "AE inserts tl_issuance_items" ON public.tl_issuance_items;
CREATE POLICY "AE inserts tl_issuance_items" ON public.tl_issuance_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tl_issuances i
    WHERE i.id = tl_issuance_items.issuance_id
      AND i.wd_code = ANY(public.current_user_ae_wds())
  ));

DROP POLICY IF EXISTS "AE views tl_returns" ON public.tl_returns;
CREATE POLICY "AE views tl_returns" ON public.tl_returns
  FOR SELECT TO authenticated
  USING (wd_code = ANY(public.current_user_ae_wds()));

DROP POLICY IF EXISTS "AE inserts tl_returns" ON public.tl_returns;
CREATE POLICY "AE inserts tl_returns" ON public.tl_returns
  FOR INSERT TO authenticated
  WITH CHECK (wd_code = ANY(public.current_user_ae_wds()) AND created_by = auth.uid());

DROP POLICY IF EXISTS "AE views tl_inactivity" ON public.tl_inactivity_reasons;
CREATE POLICY "AE views tl_inactivity" ON public.tl_inactivity_reasons
  FOR SELECT TO authenticated
  USING (wd_code = ANY(public.current_user_ae_wds()));

DROP POLICY IF EXISTS "AE inserts tl_inactivity" ON public.tl_inactivity_reasons;
CREATE POLICY "AE inserts tl_inactivity" ON public.tl_inactivity_reasons
  FOR INSERT TO authenticated
  WITH CHECK (wd_code = ANY(public.current_user_ae_wds()) AND created_by = auth.uid());

DROP POLICY IF EXISTS "AE views wd_transfers" ON public.wd_transfers;
CREATE POLICY "AE views wd_transfers" ON public.wd_transfers
  FOR SELECT TO authenticated
  USING (
    from_wd_code = ANY(public.current_user_ae_wds())
    OR to_wd_code = ANY(public.current_user_ae_wds())
  );

DROP POLICY IF EXISTS "AE views wd_transfer_items" ON public.wd_transfer_items;
CREATE POLICY "AE views wd_transfer_items" ON public.wd_transfer_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wd_transfers t
    WHERE t.id = wd_transfer_items.transfer_id
      AND (t.from_wd_code = ANY(public.current_user_ae_wds())
        OR t.to_wd_code = ANY(public.current_user_ae_wds()))
  ));

DROP POLICY IF EXISTS "AE views WD-bound dispatches" ON public.stock_movements;
CREATE POLICY "AE views WD-bound dispatches" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (movement = 'dispatch'::public.movement_type
         AND distributor = ANY(public.current_user_ae_wds()));

ALTER TABLE public.wd_stock REPLICA IDENTITY FULL;
ALTER TABLE public.tl_issuances REPLICA IDENTITY FULL;
ALTER TABLE public.tl_returns REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='wd_stock') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.wd_stock';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tl_issuances') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tl_issuances';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tl_returns') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tl_returns';
  END IF;
END$$;

CREATE FUNCTION public.user_admin_scope(_user_id uuid)
RETURNS TABLE(is_super boolean, wsp_scope public.wsp_code, wd_scope text, ae_wds text[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role) AS is_super,
    (SELECT p.wsp FROM public.profiles p
       WHERE p.id = _user_id
         AND EXISTS (SELECT 1 FROM public.user_roles ur
                     WHERE ur.user_id = _user_id AND ur.role::text = 'wsp_admin')
       LIMIT 1) AS wsp_scope,
    (SELECT p.wd_code FROM public.profiles p
       WHERE p.id = _user_id
         AND EXISTS (SELECT 1 FROM public.user_roles ur
                     WHERE ur.user_id = _user_id AND ur.role::text = 'wd_admin')
       LIMIT 1) AS wd_scope,
    COALESCE((SELECT array_agg(wd_code) FROM public.ae_assignments WHERE ae_user_id = _user_id), ARRAY[]::text[]) AS ae_wds;
$$;

CREATE FUNCTION public.list_manageable_users()
RETURNS TABLE(
  id uuid, mobile text, display_name text,
  wsp public.wsp_code, wd_code text, tl_type text,
  roles text[], allowed_wsps text[], ae_wds text[],
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT ae_user_id, array_agg(wd_code) AS wds
    FROM public.ae_assignments GROUP BY ae_user_id
  )
  SELECT p.id, p.mobile, p.display_name, p.wsp, p.wd_code, p.tl_type,
         COALESCE(r.roles, ARRAY[]::text[]),
         COALESCE(a.wsps, ARRAY[]::text[]),
         COALESCE(ae.wds, ARRAY[]::text[]),
         p.created_at
  FROM public.profiles p
  LEFT JOIN r ON r.user_id = p.id
  LEFT JOIN a ON a.wdc = p.wd_code
  LEFT JOIN ae ON ae.ae_user_id = p.id
  WHERE _is_super
     OR (_wsp_scope IS NOT NULL AND (p.wsp = _wsp_scope OR _wsp_scope::text = ANY(COALESCE(a.wsps, ARRAY[]::text[]))))
     OR (_wd_scope IS NOT NULL AND p.wd_code = _wd_scope);
END
$$;

CREATE FUNCTION public.admin_assign_role(
  _target uuid,
  _role text,
  _wsp public.wsp_code,
  _wd_code text,
  _tl_type text,
  _ae_wds text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
  _caller_scope record;
  _w text;
BEGIN
  SELECT * INTO _caller_scope FROM public.user_admin_scope(auth.uid());
  IF NOT _is_super
     AND _caller_scope.wsp_scope IS NULL
     AND _caller_scope.wd_scope IS NULL THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _role IS NOT NULL AND _role NOT IN ('wsp_admin','wd_admin','wsp','wd','tl') THEN
    RAISE EXCEPTION 'Invalid role %', _role;
  END IF;

  IF NOT _is_super THEN
    IF _caller_scope.wsp_scope IS NOT NULL THEN
      IF _role = 'wsp_admin' THEN RAISE EXCEPTION 'WSP admins cannot create WSP admins'; END IF;
      IF _role IN ('wsp','wsp_admin') AND _wsp IS DISTINCT FROM _caller_scope.wsp_scope THEN
        RAISE EXCEPTION 'Out of WSP scope';
      END IF;
    END IF;
    IF _caller_scope.wd_scope IS NOT NULL THEN
      IF _role <> 'tl' THEN RAISE EXCEPTION 'WD admins can only assign TLs'; END IF;
      IF _wd_code IS DISTINCT FROM _caller_scope.wd_scope THEN
        RAISE EXCEPTION 'Out of WD scope';
      END IF;
    END IF;
  END IF;

  DELETE FROM public.user_roles
   WHERE user_id = _target
     AND role::text IN ('wsp_admin','wd_admin','wsp','wd','tl');

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_target, _role::public.app_role);
  END IF;

  UPDATE public.profiles
     SET wsp = CASE WHEN _role IN ('wsp','wsp_admin') THEN _wsp ELSE NULL END,
         wd_code = CASE WHEN _role IN ('wd','wd_admin','tl') THEN _wd_code ELSE NULL END,
         tl_type = CASE WHEN _role = 'tl' THEN _tl_type ELSE NULL END,
         updated_at = now()
   WHERE id = _target;

  IF _is_super AND _ae_wds IS NOT NULL THEN
    DELETE FROM public.ae_assignments WHERE ae_user_id = _target;
    IF _role = 'wd_admin' THEN
      FOREACH _w IN ARRAY _ae_wds LOOP
        IF _w IS NOT NULL AND length(btrim(_w)) > 0 THEN
          INSERT INTO public.ae_assignments (ae_user_id, wd_code)
          VALUES (_target, btrim(_w))
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;
END
$$;
