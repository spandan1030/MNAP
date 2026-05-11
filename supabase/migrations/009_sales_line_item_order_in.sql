-- Migration 009: Add order_in flag to sales_line_items
-- Marks items that need to be updated in Order Stock after the sale.
ALTER TABLE sales_line_items
  ADD COLUMN IF NOT EXISTS order_in BOOLEAN NOT NULL DEFAULT FALSE;
