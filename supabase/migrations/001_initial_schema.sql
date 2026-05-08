-- ============================================================
-- M N Alankar Palace — Jewellery Store Management System
-- Database Schema v1.0
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ITEM MASTER
-- ============================================================
CREATE TABLE item_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default items
INSERT INTO item_master (name) VALUES
  ('Necklace'), ('Ring'), ('Bangle'), ('Chain'), ('Earrings'),
  ('Bracelet'), ('Pendant'), ('Coin'), ('Mangalsutra'), ('Anklet');

-- ============================================================
-- DAY SESSIONS
-- ============================================================
CREATE TABLE day_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  register_a_opening NUMERIC(12,2) NOT NULL DEFAULT 0,
  register_b_opening NUMERIC(12,2) NOT NULL DEFAULT 0,
  register_a_closing NUMERIC(12,2),
  register_b_closing NUMERIC(12,2),
  opened_by UUID NOT NULL REFERENCES profiles(id),
  closed_by UUID REFERENCES profiles(id),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- ============================================================
-- SALES BILLS (Module A)
-- ============================================================
CREATE TABLE sales_bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_session_id UUID NOT NULL REFERENCES day_sessions(id),
  bill_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  metal_type TEXT NOT NULL CHECK (metal_type IN ('gold', 'silver', 'other')),
  purity TEXT,
  party TEXT NOT NULL DEFAULT 'MNAP',
  total_amount NUMERIC(12,2) NOT NULL,
  old_gold_weight NUMERIC(10,3),
  old_gold_amount NUMERIC(12,2),
  old_silver_weight NUMERIC(10,3),
  old_silver_amount NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(day_session_id, bill_number)
);

-- ============================================================
-- SALES LINE ITEMS
-- ============================================================
CREATE TABLE sales_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES sales_bills(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  weight NUMERIC(10,3),
  amount NUMERIC(12,2) NOT NULL
);

-- ============================================================
-- SALES PAYMENTS
-- ============================================================
CREATE TABLE sales_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES sales_bills(id) ON DELETE CASCADE,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN (
    'cash', 'card', 'upi', 'cheque',
    'customer_credit', 'advance_adjustment', 'sip_adjustment'
  )),
  amount NUMERIC(12,2) NOT NULL,
  cheque_number TEXT,
  reference_serial TEXT
);

-- ============================================================
-- MONEY RECEIPTS (Module B)
-- ============================================================
CREATE TABLE money_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_session_id UUID NOT NULL REFERENCES day_sessions(id),
  receipt_type TEXT NOT NULL CHECK (receipt_type IN ('advance', 'sip', 'customer_credit', 'repair')),
  serial_number TEXT,
  customer_name TEXT NOT NULL,
  repair_type TEXT,
  weight NUMERIC(10,3),
  amount NUMERIC(12,2) NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'card', 'upi', 'cheque')),
  cheque_number TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EXPENSES (Module C)
-- ============================================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_session_id UUID NOT NULL REFERENCES day_sessions(id),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('cash', 'bank_transfer')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG (immutable)
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  original_value TEXT,
  edited_value TEXT,
  edited_by UUID NOT NULL REFERENCES profiles(id),
  edited_at TIMESTAMPTZ DEFAULT NOW(),
  edit_reason TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- PROFILES
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admin can read all profiles" ON profiles
  FOR SELECT USING (get_user_role() = 'admin');
CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "Admin can update profiles" ON profiles
  FOR UPDATE USING (get_user_role() = 'admin');

-- ITEM MASTER
CREATE POLICY "All users can read active items" ON item_master
  FOR SELECT USING (is_active = TRUE OR get_user_role() = 'admin');
CREATE POLICY "Admin can manage items" ON item_master
  FOR ALL USING (get_user_role() = 'admin');

-- DAY SESSIONS
CREATE POLICY "All authenticated can read today session" ON day_sessions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage day sessions" ON day_sessions
  FOR ALL USING (get_user_role() = 'admin');

-- SALES BILLS
CREATE POLICY "Staff can insert bills" ON sales_bills
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Staff can read own bills" ON sales_bills
  FOR SELECT USING (submitted_by = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "Admin can update bills" ON sales_bills
  FOR UPDATE USING (get_user_role() = 'admin');

-- SALES LINE ITEMS
CREATE POLICY "All authenticated can read line items" ON sales_line_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert line items" ON sales_line_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage line items" ON sales_line_items
  FOR ALL USING (get_user_role() = 'admin');

-- SALES PAYMENTS
CREATE POLICY "All authenticated can read payments" ON sales_payments
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert payments" ON sales_payments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage payments" ON sales_payments
  FOR ALL USING (get_user_role() = 'admin');

-- MONEY RECEIPTS
CREATE POLICY "Staff can insert receipts" ON money_receipts
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Staff can read own receipts" ON money_receipts
  FOR SELECT USING (submitted_by = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "Admin can update receipts" ON money_receipts
  FOR UPDATE USING (get_user_role() = 'admin');

-- EXPENSES
CREATE POLICY "Staff can insert expenses" ON expenses
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Staff can read own expenses" ON expenses
  FOR SELECT USING (submitted_by = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "Admin can update expenses" ON expenses
  FOR UPDATE USING (get_user_role() = 'admin');

-- AUDIT LOG (read-only for all, insert only via admin)
CREATE POLICY "Admin can read audit log" ON audit_log
  FOR SELECT USING (get_user_role() = 'admin');
CREATE POLICY "Admin can insert audit log" ON audit_log
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, role, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff'),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
