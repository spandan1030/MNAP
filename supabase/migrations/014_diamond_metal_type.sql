-- Migration 014 — Add 'diamond' to metal_type on sales_line_items
-- Diamond is now its own metal category (purity = 'Diamond', metal_type = 'diamond').
-- Previously Diamond was filed under gold. Existing rows are unaffected (they still
-- have metal_type='gold' + purity='Diamond' and will display correctly).

ALTER TABLE sales_line_items
  DROP CONSTRAINT IF EXISTS sales_line_items_metal_type_check;

ALTER TABLE sales_line_items
  ADD CONSTRAINT sales_line_items_metal_type_check
  CHECK (metal_type IN ('gold', 'silver', 'diamond', 'other'));
