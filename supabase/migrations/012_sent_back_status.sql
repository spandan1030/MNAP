-- Migration 012 — Add sent_back status and send_back_reason to all entry tables
-- Allows admin to send an entry back to staff for correction instead of rejecting it outright.
-- Staff can then load the entry, fix it, and resubmit (status flips back to pending).

-- sales_bills
ALTER TABLE sales_bills
  DROP CONSTRAINT IF EXISTS sales_bills_status_check;
ALTER TABLE sales_bills
  ADD CONSTRAINT sales_bills_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'sent_back'));
ALTER TABLE sales_bills
  ADD COLUMN IF NOT EXISTS send_back_reason TEXT;

-- money_receipts
ALTER TABLE money_receipts
  DROP CONSTRAINT IF EXISTS money_receipts_status_check;
ALTER TABLE money_receipts
  ADD CONSTRAINT money_receipts_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'sent_back'));
ALTER TABLE money_receipts
  ADD COLUMN IF NOT EXISTS send_back_reason TEXT;

-- expenses
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'sent_back'));
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS send_back_reason TEXT;

-- old_gold_purchases
ALTER TABLE old_gold_purchases
  DROP CONSTRAINT IF EXISTS old_gold_purchases_status_check;
ALTER TABLE old_gold_purchases
  ADD CONSTRAINT old_gold_purchases_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'sent_back'));
ALTER TABLE old_gold_purchases
  ADD COLUMN IF NOT EXISTS send_back_reason TEXT;

-- direct_receipts
ALTER TABLE direct_receipts
  DROP CONSTRAINT IF EXISTS direct_receipts_status_check;
ALTER TABLE direct_receipts
  ADD CONSTRAINT direct_receipts_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'sent_back'));
ALTER TABLE direct_receipts
  ADD COLUMN IF NOT EXISTS send_back_reason TEXT;

-- party_payments
ALTER TABLE party_payments
  DROP CONSTRAINT IF EXISTS party_payments_status_check;
ALTER TABLE party_payments
  ADD CONSTRAINT party_payments_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'sent_back'));
ALTER TABLE party_payments
  ADD COLUMN IF NOT EXISTS send_back_reason TEXT;

-- approval_sales
ALTER TABLE approval_sales
  DROP CONSTRAINT IF EXISTS approval_sales_status_check;
ALTER TABLE approval_sales
  ADD CONSTRAINT approval_sales_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'sent_back'));
ALTER TABLE approval_sales
  ADD COLUMN IF NOT EXISTS send_back_reason TEXT;
