-- ============================================================
-- Pipeline FK Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add nullable lead_id to bids
ALTER TABLE bids ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id);

-- Add nullable bid_id to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bid_id UUID REFERENCES bids(id);

-- Indexes for FK lookups
CREATE INDEX IF NOT EXISTS idx_bids_lead_id ON bids(lead_id);
CREATE INDEX IF NOT EXISTS idx_projects_bid_id ON projects(bid_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
