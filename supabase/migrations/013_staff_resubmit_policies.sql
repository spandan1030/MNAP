-- Migration 013 — RLS policies for staff resubmit (sent_back → pending)
-- Staff need UPDATE on their own sent_back rows to flip status back to pending.
-- Staff need DELETE on child rows (line items / payments) for the two modules
-- that replace children on resubmit (sales_bills and approval_sales).

-- sales_bills
CREATE POLICY "staff can resubmit own sent_back sales_bills"
  ON sales_bills FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'sent_back')
  WITH CHECK (submitted_by = auth.uid());

-- money_receipts
CREATE POLICY "staff can resubmit own sent_back money_receipts"
  ON money_receipts FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'sent_back')
  WITH CHECK (submitted_by = auth.uid());

-- expenses
CREATE POLICY "staff can resubmit own sent_back expenses"
  ON expenses FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'sent_back')
  WITH CHECK (submitted_by = auth.uid());

-- old_gold_purchases
CREATE POLICY "staff can resubmit own sent_back old_gold_purchases"
  ON old_gold_purchases FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'sent_back')
  WITH CHECK (submitted_by = auth.uid());

-- direct_receipts
CREATE POLICY "staff can resubmit own sent_back direct_receipts"
  ON direct_receipts FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'sent_back')
  WITH CHECK (submitted_by = auth.uid());

-- party_payments
CREATE POLICY "staff can resubmit own sent_back party_payments"
  ON party_payments FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'sent_back')
  WITH CHECK (submitted_by = auth.uid());

-- approval_sales
CREATE POLICY "staff can resubmit own sent_back approval_sales"
  ON approval_sales FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'sent_back')
  WITH CHECK (submitted_by = auth.uid());

-- sales_line_items — staff delete own bill's items during resubmit
CREATE POLICY "staff can delete line items of own bills"
  ON sales_line_items FOR DELETE TO authenticated
  USING (bill_id IN (
    SELECT id FROM sales_bills WHERE submitted_by = auth.uid()
  ));

-- sales_payments — staff delete own bill's payments during resubmit
CREATE POLICY "staff can delete payments of own bills"
  ON sales_payments FOR DELETE TO authenticated
  USING (bill_id IN (
    SELECT id FROM sales_bills WHERE submitted_by = auth.uid()
  ));

-- approval_sale_items — staff delete own sale's items during resubmit
CREATE POLICY "staff can delete items of own approval_sales"
  ON approval_sale_items FOR DELETE TO authenticated
  USING (sale_id IN (
    SELECT id FROM approval_sales WHERE submitted_by = auth.uid()
  ));
