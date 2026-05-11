-- Migration 008: Allow NULL on money_receipts.payment_mode
-- When a receipt is fully settled by old metal exchange, no payment mode applies.
ALTER TABLE money_receipts ALTER COLUMN payment_mode DROP NOT NULL;
