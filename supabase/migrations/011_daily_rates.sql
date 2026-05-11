-- Migration 011: Daily gold/silver rates
-- source column is 'manual' for admin-entered rates.
-- Future: set source = 'google_sheets' when auto-fetching from a sheet.
-- The UNIQUE constraint on date means any upsert (manual or auto) just overwrites the same row.
CREATE TABLE IF NOT EXISTS daily_rates (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE         NOT NULL,
  rate_24kt   NUMERIC(10,2),
  rate_22kt   NUMERIC(10,2),
  rate_18kt   NUMERIC(10,2),
  rate_silver NUMERIC(10,2),
  source      TEXT         NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual', 'google_sheets')),
  updated_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT daily_rates_date_key UNIQUE (date)
);

ALTER TABLE daily_rates ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins manage rates"
  ON daily_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Staff can read (so they can reference rates while entering bills)
CREATE POLICY "Staff read rates"
  ON daily_rates FOR SELECT TO authenticated
  USING (true);
