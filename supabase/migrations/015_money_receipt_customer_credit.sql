-- Migration 015 — Add 'customer_credit' to money_receipts payment_mode CHECK
-- Allows staff to record money receipts where the customer settles via
-- store credit (same mode already used in sales_payments).

ALTER TABLE money_receipts
  DROP CONSTRAINT IF EXISTS money_receipts_payment_mode_check;

ALTER TABLE money_receipts
  ADD CONSTRAINT money_receipts_payment_mode_check
  CHECK (payment_mode IN (
    'cash', 'card', 'upi', 'phonepe', 'cheque',
    'advance_adjustment', 'sip_adjustment', 'customer_credit'
  ));
