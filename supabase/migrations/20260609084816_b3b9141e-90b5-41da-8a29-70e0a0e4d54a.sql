CREATE OR REPLACE FUNCTION public.admin_import_hierarchy(_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  ae_added int := 0; ae_updated int := 0;
  wd_added int := 0; wd_updated int := 0;
  tl_added int := 0; tl_updated int := 0;
  wsp_added int := 0;
  inserted boolean;
  v_wsp text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only super admins can import hierarchy';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    -- AE
    WITH up AS (
      INSERT INTO public.hierarchy_ae(ae_id, ae_name, section_id)
      VALUES (r->>'ae_id', r->>'ae_name', r->>'section_id')
      ON CONFLICT (ae_id) DO UPDATE SET ae_name = EXCLUDED.ae_name,
         section_id = COALESCE(EXCLUDED.section_id, public.hierarchy_ae.section_id),
         updated_at = now()
      RETURNING (xmax = 0) AS ins
    ) SELECT ins INTO inserted FROM up;
    IF inserted THEN ae_added := ae_added + 1; ELSE ae_updated := ae_updated + 1; END IF;

    -- WD
    IF (r->>'wd_code') IS NOT NULL AND length(r->>'wd_code') > 0 THEN
      WITH up AS (
        INSERT INTO public.hierarchy_wd(wd_code, wd_name, ae_id)
        VALUES (r->>'wd_code', COALESCE(r->>'wd_name',''), r->>'ae_id')
        ON CONFLICT (wd_code) DO UPDATE SET wd_name = EXCLUDED.wd_name,
           ae_id = EXCLUDED.ae_id, updated_at = now()
        RETURNING (xmax = 0) AS ins
      ) SELECT ins INTO inserted FROM up;
      IF inserted THEN wd_added := wd_added + 1; ELSE wd_updated := wd_updated + 1; END IF;

      -- WSP mapping (optional). Adds the mapping if not already present.
      v_wsp := NULLIF(upper(trim(COALESCE(r->>'wsp',''))), '');
      IF v_wsp IS NOT NULL THEN
        IF v_wsp NOT IN ('CEVL','CEVJ','CEVY') THEN
          RAISE EXCEPTION 'Invalid WSP "%" for WD %', v_wsp, r->>'wd_code';
        END IF;
        INSERT INTO public.wd_assignments(wd_code, wsp)
        VALUES (r->>'wd_code', v_wsp::wsp_code)
        ON CONFLICT (wd_code, wsp) DO NOTHING;
        IF FOUND THEN wsp_added := wsp_added + 1; END IF;
      END IF;
    END IF;

    -- TL
    IF (r->>'tl_id') IS NOT NULL AND length(r->>'tl_id') > 0 THEN
      WITH up AS (
        INSERT INTO public.hierarchy_tl(tl_id, tl_name, wd_code, active)
        VALUES (r->>'tl_id', COALESCE(r->>'tl_name',''), r->>'wd_code', true)
        ON CONFLICT (tl_id) DO UPDATE SET tl_name = EXCLUDED.tl_name,
           wd_code = EXCLUDED.wd_code, updated_at = now()
        RETURNING (xmax = 0) AS ins
      ) SELECT ins INTO inserted FROM up;
      IF inserted THEN tl_added := tl_added + 1; ELSE tl_updated := tl_updated + 1; END IF;
    END IF;
  END LOOP;

  UPDATE public.profiles p
  SET ae_id = h.ae_id
  FROM public.hierarchy_wd h
  WHERE p.wd_code = h.wd_code
    AND p.ae_id IS NULL
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'wd_admin');

  RETURN jsonb_build_object(
    'ae_rows', ae_added + ae_updated, 'wd_rows', wd_added + wd_updated, 'tl_rows', tl_added + tl_updated,
    'ae_added', ae_added, 'ae_updated', ae_updated,
    'wd_added', wd_added, 'wd_updated', wd_updated,
    'tl_added', tl_added, 'tl_updated', tl_updated,
    'wsp_added', wsp_added
  );
END;
$function$;