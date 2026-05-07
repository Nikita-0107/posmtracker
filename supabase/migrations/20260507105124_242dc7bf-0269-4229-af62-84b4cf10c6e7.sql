
-- 1. Hierarchy tables
CREATE TABLE IF NOT EXISTS public.hierarchy_ae (
  ae_id text PRIMARY KEY,
  ae_name text NOT NULL,
  section_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hierarchy_wd (
  wd_code text PRIMARY KEY,
  wd_name text NOT NULL,
  ae_id text NOT NULL REFERENCES public.hierarchy_ae(ae_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hierarchy_wd_ae ON public.hierarchy_wd(ae_id);

CREATE TABLE IF NOT EXISTS public.hierarchy_tl (
  tl_id text PRIMARY KEY,
  tl_name text NOT NULL,
  wd_code text NOT NULL REFERENCES public.hierarchy_wd(wd_code) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hierarchy_tl_wd ON public.hierarchy_tl(wd_code);

ALTER TABLE public.hierarchy_ae ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hierarchy_wd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hierarchy_tl ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read hierarchy (needed for AE to see their WDs, TL to see WD, etc.)
CREATE POLICY "Authenticated read hierarchy_ae" ON public.hierarchy_ae FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read hierarchy_wd" ON public.hierarchy_wd FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read hierarchy_tl" ON public.hierarchy_tl FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage hierarchy_ae" ON public.hierarchy_ae FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage hierarchy_wd" ON public.hierarchy_wd FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage hierarchy_tl" ON public.hierarchy_tl FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- AE can manage their own TLs
CREATE POLICY "AE manage own hierarchy_tl" ON public.hierarchy_tl FOR ALL TO authenticated
  USING (wd_code IN (SELECT wd_code FROM public.hierarchy_wd WHERE ae_id = (SELECT ae_id FROM public.profiles WHERE id = auth.uid())))
  WITH CHECK (wd_code IN (SELECT wd_code FROM public.hierarchy_wd WHERE ae_id = (SELECT ae_id FROM public.profiles WHERE id = auth.uid())));

-- 2. Profile additions
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ae_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tl_id text;
CREATE INDEX IF NOT EXISTS idx_profiles_ae_id ON public.profiles(ae_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tl_id ON public.profiles(tl_id);

-- 3. Update current_user_ae_wds to read from hierarchy with legacy fallback
CREATE OR REPLACE FUNCTION public.current_user_ae_wds()
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(ARRAY(
      SELECT wd_code FROM public.hierarchy_wd
      WHERE ae_id = (SELECT ae_id FROM public.profiles WHERE id = auth.uid())
    ), ARRAY[]::text[]),
    ARRAY(
      SELECT wd_code FROM public.ae_assignments WHERE ae_user_id = auth.uid()
    )
  );
$$;

-- Helper: resolve TL's WD from hierarchy (via profiles.tl_id) with legacy fallback
CREATE OR REPLACE FUNCTION public.current_user_tl_wd_code()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT wd_code FROM public.hierarchy_tl
       WHERE tl_id = (SELECT tl_id FROM public.profiles WHERE id = auth.uid())),
    (SELECT wd_code FROM public.wd_tls WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

-- 4. Remove 'wd' role assignments (keep enum value for safety)
DELETE FROM public.user_roles WHERE role::text = 'wd';

-- 5. Drop the TL self-setup RPC (no longer used)
DROP FUNCTION IF EXISTS public.tl_submit_setup(integer);

-- 6. Server-side function for super admin to import hierarchy rows in bulk
CREATE OR REPLACE FUNCTION public.admin_import_hierarchy(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  ae_count int := 0;
  wd_count int := 0;
  tl_count int := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can import hierarchy';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    -- Upsert AE
    INSERT INTO public.hierarchy_ae(ae_id, ae_name, section_id)
    VALUES (r->>'ae_id', r->>'ae_name', r->>'section_id')
    ON CONFLICT (ae_id) DO UPDATE SET ae_name = EXCLUDED.ae_name,
       section_id = COALESCE(EXCLUDED.section_id, public.hierarchy_ae.section_id),
       updated_at = now();
    ae_count := ae_count + 1;

    -- Upsert WD
    IF (r->>'wd_code') IS NOT NULL AND length(r->>'wd_code') > 0 THEN
      INSERT INTO public.hierarchy_wd(wd_code, wd_name, ae_id)
      VALUES (r->>'wd_code', COALESCE(r->>'wd_name',''), r->>'ae_id')
      ON CONFLICT (wd_code) DO UPDATE SET wd_name = EXCLUDED.wd_name,
         ae_id = EXCLUDED.ae_id, updated_at = now();
      wd_count := wd_count + 1;
    END IF;

    -- Upsert TL
    IF (r->>'tl_id') IS NOT NULL AND length(r->>'tl_id') > 0 THEN
      INSERT INTO public.hierarchy_tl(tl_id, tl_name, wd_code, active)
      VALUES (r->>'tl_id', COALESCE(r->>'tl_name',''), r->>'wd_code', true)
      ON CONFLICT (tl_id) DO UPDATE SET tl_name = EXCLUDED.tl_name,
         wd_code = EXCLUDED.wd_code, updated_at = now();
      tl_count := tl_count + 1;
    END IF;
  END LOOP;

  -- Auto-migrate existing wd_admin profiles: set ae_id from wd_code via hierarchy
  UPDATE public.profiles p
  SET ae_id = h.ae_id
  FROM public.hierarchy_wd h
  WHERE p.wd_code = h.wd_code
    AND p.ae_id IS NULL
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'wd_admin');

  RETURN jsonb_build_object('ae_rows', ae_count, 'wd_rows', wd_count, 'tl_rows', tl_count);
END;
$$;
