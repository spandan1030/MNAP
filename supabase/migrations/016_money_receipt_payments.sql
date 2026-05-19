-- Migration 016: money_receipt_payments
-- Creates a child table for money receipt payments (mirrors sales_payments for sales_bills).
-- Also migrates existing single-mode payment data into child rows.

CREATE TABLE IF NOT EXISTS money_receipt_payments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id       UUID          NOT NULL REFERENCES money_receipts(id) ON DELETE CASCADE,
  payment_mode     TEXT          NOT NULL
                                 CHECK (payment_mode IN (
                                   'cash', 'card', 'upi', 'phonepe', 'cheque',
                                   'advance_adjustment', 'sip_adjustment', 'customer_credit'
                                 )),
  amount           NUMERIC(12,2) NOT NULL,
  cheque_number    TEXT,
  reference_serial TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE money_receipt_payments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read and insert (same as sales_payments)
CREATE POLICY "All authenticated read and insert money_receipt_payments"
  ON money_receipt_payments FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Admins can manage all rows
CREATE POLICY "Admin manage money_receipt_payments"
  ON money_receipt_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Staff can delete payment rows for their own receipts (needed for resubmit)
CREATE POLICY "Staff delete own receipt payments"
  ON money_receipt_payments FOR DELETE TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM money_receipts WHERE submitted_by = auth.uid()
    )
  );

-- Data migration: convert existing single payment_mode rows into child rows.
-- Only migrates records where payment_mode is set and the cash portion is positive.
INSERT INTO money_receipt_payments (receipt_id, payment_mode, amount, cheque_number, reference_serial)
SELECT
  id,
  payment_mode,
  GREATEST(0, amount - COALESCE(old_gold_amount, 0) - COALESCE(old_silver_amount, 0)),
  cheque_number,
  reference_serial
FROM money_receipts
WHERE payment_mode IS NOT NULL
  AND GREATEST(0, amount - COALESCE(old_gold_amount, 0) - COALESCE(old_silver_amount, 0)) > 0;
