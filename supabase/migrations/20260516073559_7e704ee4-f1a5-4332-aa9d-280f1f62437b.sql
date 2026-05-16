DO $$
DECLARE
  test_codes text[] := ARRAY['Harini','Duplicate material'];
BEGIN
  DELETE FROM stock_movement_edits WHERE old_material_code = ANY(test_codes) OR new_material_code = ANY(test_codes);
  DELETE FROM tl_uploads WHERE issuance_item_id IN (SELECT id FROM tl_issuance_items WHERE material_code = ANY(test_codes));
  DELETE FROM tl_issuance_items WHERE material_code = ANY(test_codes);
  DELETE FROM tl_returns WHERE material_code = ANY(test_codes);
  DELETE FROM tl_usages WHERE material_code = ANY(test_codes);
  DELETE FROM tl_weekly_allocation_items WHERE material_code = ANY(test_codes);
  DELETE FROM wd_stock_snapshots WHERE material_code = ANY(test_codes);
  DELETE FROM wd_transfer_items WHERE material_code = ANY(test_codes);
  DELETE FROM stock_concerns WHERE material_code = ANY(test_codes);
  DELETE FROM stock_movements WHERE material_code = ANY(test_codes);
  DELETE FROM stock WHERE material_code = ANY(test_codes);
  DELETE FROM wd_stock WHERE material_code = ANY(test_codes);
  DELETE FROM materials WHERE code = ANY(test_codes);
END $$;