-- Migration 003: Move metal_type, purity, party to sales_line_items
-- Run in Supabase SQL Editor

ALTER TABLE sales_line_items
  ADD COLUMN metal_type TEXT NOT NULL DEFAULT 'gold'
    CHECK (metal_type IN ('gold', 'silver', 'other')),
  ADD COLUMN purity TEXT,
  ADD COLUMN party TEXT NOT NULL DEFAULT 'MNAP';
