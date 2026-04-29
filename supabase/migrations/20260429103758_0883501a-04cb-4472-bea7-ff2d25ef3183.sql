REVOKE EXECUTE ON FUNCTION public.receive_materials(text, text, jsonb, date, public.batch_type) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.receive_materials(text, text, jsonb, date, public.batch_type) FROM anon;
GRANT EXECUTE ON FUNCTION public.receive_materials(text, text, jsonb, date, public.batch_type) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.receive_material_with_create(text, text, integer, text, text, date, public.batch_type) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.receive_material_with_create(text, text, integer, text, text, date, public.batch_type) FROM anon;
GRANT EXECUTE ON FUNCTION public.receive_material_with_create(text, text, integer, text, text, date, public.batch_type) TO authenticated;