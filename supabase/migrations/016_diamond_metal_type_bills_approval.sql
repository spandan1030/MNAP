-- Migration 016 — Add 'diamond' to metal_type CHECK on sales_bills and approval_sale_items
-- Migration 014 already fixed sales_line_items.
-- sales_bills.metal_type still had the old ('gold','silver','other') constraint,
-- causing a CHECK violation when submitting a bill with purity = Diamond.
-- approval_sale_items had the same gap from migration 005.

ALTER TABLE sales_bills
  DROP CONSTRAINT IF EXISTS sales_bills_metal_type_check;

ALTER TABLE sales_bills
  ADD CONSTRAINT sales_bills_metal_type_check
  CHECK (metal_type IN ('gold', 'silver', 'diamond', 'other'));

ALTER TABLE approval_sale_items
  DROP CONSTRAINT IF EXISTS approval_sale_items_metal_type_check;

ALTER TABLE approval_sale_items
  ADD CONSTRAINT approval_sale_items_metal_type_check
  CHECK (metal_type IN ('gold', 'silver', 'diamond', 'other'));
