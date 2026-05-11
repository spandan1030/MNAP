-- Migration 007: Expand money_receipts payment modes + add reference_serial
-- Adds PhonePe, Advance Adjustment, SIP Adjustment to money_receipts

ALTER TABLE money_receipts
  DROP CONSTRAINT IF EXISTS money_receipts_payment_mode_check;

ALTER TABLE money_receipts
  ADD CONSTRAINT money_receipts_payment_mode_check
  CHECK (payment_mode IN ('cash', 'card', 'upi', 'phonepe', 'cheque', 'advance_adjustment', 'sip_adjustment'));

ALTER TABLE money_receipts
  ADD COLUMN IF NOT EXISTS reference_serial TEXT;
