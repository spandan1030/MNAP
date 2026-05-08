-- Migration 004: Party Payments module
-- Run in Supabase SQL Editor

CREATE TABLE party_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_session_id UUID NOT NULL REFERENCES day_sessions(id),
  party_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'bank_transfer')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE party_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can insert party payments" ON party_payments
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Staff can read own party payments" ON party_payments
  FOR SELECT USING (submitted_by = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "Admin can update party payments" ON party_payments
  FOR UPDATE USING (get_user_role() = 'admin');
