
CREATE OR REPLACE FUNCTION public.admin_import_wd_stock(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_wd text;
  v_mat text;
  v_name text;
  v_qty int;
  v_materials_created int := 0;
  v_stock_added int := 0;
  v_stock_updated int := 0;
  v_existed boolean;
  v_mat_existed boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    v_wd  := r->>'wd_code';
    v_mat := r->>'material_code';
    v_name := COALESCE(NULLIF(r->>'material_name',''), v_mat);
    v_qty := COALESCE((r->>'qty')::int, 0);

    -- ensure material exists (auto-create from sheet description)
    SELECT EXISTS(SELECT 1 FROM materials WHERE code = v_mat) INTO v_mat_existed;
    IF NOT v_mat_existed THEN
      INSERT INTO materials (code, name) VALUES (v_mat, v_name)
      ON CONFLICT (code) DO NOTHING;
      v_materials_created := v_materials_created + 1;
    END IF;

    -- upsert wd_stock
    SELECT EXISTS(SELECT 1 FROM wd_stock WHERE wd_code = v_wd AND material_code = v_mat) INTO v_existed;
    INSERT INTO wd_stock (wd_code, material_code, qty, updated_at)
    VALUES (v_wd, v_mat, v_qty, now())
    ON CONFLICT (wd_code, material_code)
    DO UPDATE SET qty = EXCLUDED.qty, updated_at = now();

    IF v_existed THEN
      v_stock_updated := v_stock_updated + 1;
    ELSE
      v_stock_added := v_stock_added + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'stock_added', v_stock_added,
    'stock_updated', v_stock_updated,
    'materials_created', v_materials_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_import_wd_stock(jsonb) TO authenticated;
