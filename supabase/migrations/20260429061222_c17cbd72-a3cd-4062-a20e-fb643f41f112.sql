DELETE FROM public.stock_movements WHERE material_code = '15462';
DELETE FROM public.stock WHERE material_code = '15462';
DELETE FROM public.wd_stock WHERE material_code = '15462';
DELETE FROM public.tl_issuance_items WHERE material_code = '15462';
DELETE FROM public.materials WHERE code = '15462';