-- Migration 005: Approval / Other Party Sales module
-- Run in Supabase SQL Editor

CREATE TABLE approval_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_session_id UUID NOT NULL REFERENCES day_sessions(id),
  party_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'approval' CHECK (transaction_type IN ('sale', 'approval')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE approval_sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES approval_sales(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  metal_type TEXT NOT NULL DEFAULT 'gold' CHECK (metal_type IN ('gold', 'silver', 'other')),
  purity TEXT,
  party TEXT NOT NULL DEFAULT 'MNAP',
  weight NUMERIC(10,3),
  notes TEXT
);

ALTER TABLE approval_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can insert approval sales" ON approval_sales
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Staff can read own approval sales" ON approval_sales
  FOR SELECT USING (submitted_by = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "Admin can update approval sales" ON approval_sales
  FOR UPDATE USING (get_user_role() = 'admin');

ALTER TABLE approval_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can read approval sale items" ON approval_sale_items
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Staff can insert approval sale items" ON approval_sale_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
