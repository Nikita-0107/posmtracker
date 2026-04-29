-- Delete transactional data in dependency order
DELETE FROM public.tl_uploads;
DELETE FROM public.tl_issuance_items;
DELETE FROM public.tl_issuances;
DELETE FROM public.stock_movement_edits;
DELETE FROM public.stock_movements;
DELETE FROM public.notifications;

-- Reset all stock quantities to zero (keep rows so structure stays consistent)
UPDATE public.wd_stock SET qty = 0, updated_at = now();
UPDATE public.stock SET qty = 0, updated_at = now();