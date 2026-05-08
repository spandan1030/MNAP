-- ============================================================
-- Migration 002 — New Modules (Old Gold Purchase, Direct Receipt, PhonePe)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add PhonePe to sales_payments constraint
ALTER TABLE sales_payments DROP CONSTRAINT IF EXISTS sales_payments_payment_mode_check;
ALTER TABLE sales_payments ADD CONSTRAINT sales_payments_payment_mode_check
  CHECK (payment_mode IN (
    'cash', 'card', 'upi', 'phonepe', 'cheque',
    'customer_credit', 'advance_adjustment', 'sip_adjustment'
  ));

-- ============================================================
-- OLD GOLD PURCHASES (Module E)
-- Store purchases gold/silver from customer, pays cash out
-- ============================================================
CREATE TABLE old_gold_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_session_id UUID NOT NULL REFERENCES day_sessions(id),
  customer_name TEXT,
  customer_phone TEXT,
  metal_type TEXT NOT NULL DEFAULT 'gold' CHECK (metal_type IN ('gold', 'silver')),
  purity TEXT,
  weight NUMERIC(10,3),
  rate_per_gram NUMERIC(10,2),
  total_amount NUMERIC(12,2) NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'bank_transfer')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE old_gold_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can insert old gold purchases" ON old_gold_purchases
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Staff can read own old gold purchases" ON old_gold_purchases
  FOR SELECT USING (submitted_by = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "Admin can update old gold purchases" ON old_gold_purchases
  FOR UPDATE USING (get_user_role() = 'admin');

-- ============================================================
-- DIRECT MONEY RECEIPTS (Module F)
-- Simple cash receipt with name and reference number
-- ============================================================
CREATE TABLE direct_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_session_id UUID NOT NULL REFERENCES day_sessions(id),
  customer_name TEXT NOT NULL,
  customer_number TEXT,
  amount NUMERIC(12,2) NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN (
    'cash', 'card', 'upi', 'phonepe', 'cheque', 'bank_transfer'
  )),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE direct_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can insert direct receipts" ON direct_receipts
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Staff can read own direct receipts" ON direct_receipts
  FOR SELECT USING (submitted_by = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "Admin can update direct receipts" ON direct_receipts
  FOR UPDATE USING (get_user_role() = 'admin');
