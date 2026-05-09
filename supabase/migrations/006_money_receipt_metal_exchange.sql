-- ============================================================
-- Migration 006: Add old gold/silver exchange to money_receipts
-- Customers can now settle receipts (advance, SIP, credit, repair)
-- partially or fully using old gold/silver instead of cash.
-- ============================================================

ALTER TABLE money_receipts
  ADD COLUMN old_gold_weight  NUMERIC(10,3),
  ADD COLUMN old_gold_amount  NUMERIC(12,2),
  ADD COLUMN old_silver_weight NUMERIC(10,3),
  ADD COLUMN old_silver_amount NUMERIC(12,2);
