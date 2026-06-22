UPDATE public.stock SET qty = qty - 50, updated_at = now() WHERE wsp='CEVL' AND material_code='M/0127401101';
DELETE FROM public.stock_movements WHERE reference_number = 'ce6c9019-M/0127401101';
DELETE FROM public.receipt_plans WHERE id = 'ce6c9019-ac68-42d2-9d30-c21c6e711aa6';