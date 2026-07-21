-- ============================================================
-- TwinBlueprint — Full Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- EXISTING GRANTS
-- ============================================================
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.users TO authenticated;

GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.leads TO authenticated;

GRANT ALL ON public.companies TO service_role;
GRANT ALL ON public.companies TO authenticated;

GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.notifications TO authenticated;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================
-- FIX RELATIONSHIPS
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications DROP COLUMN IF EXISTS user_id;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE leads DROP COLUMN IF EXISTS assigned_to;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to BIGINT REFERENCES users(id);

-- ============================================================
-- LEAD SCHEMA CHANGES
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'industry'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'category'
  ) THEN
    ALTER TABLE leads RENAME COLUMN industry TO category;
  END IF;
END $$;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS applications integer DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score integer DEFAULT 0;

-- ============================================================
-- RLS FIX — disables RLS on all tables so service_role works
-- ============================================================
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE bids DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- EXISTING INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_company_name ON companies(company_name);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- BIDS
-- ============================================================
CREATE TABLE IF NOT EXISTS bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE bids ADD COLUMN IF NOT EXISTS project TEXT;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS client TEXT;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'RFP Review';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS suppliers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS value NUMERIC;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE bids SET project = '' WHERE project IS NULL;
UPDATE bids SET client = '' WHERE client IS NULL;
ALTER TABLE bids ALTER COLUMN project SET NOT NULL;
ALTER TABLE bids ALTER COLUMN client SET NOT NULL;

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS suppliers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS uses_3d BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS competitor TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS issue TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE projects SET project = '' WHERE project IS NULL;
UPDATE projects SET client = '' WHERE client IS NULL;
UPDATE projects SET start_date = CURRENT_DATE WHERE start_date IS NULL;
UPDATE projects SET end_date = CURRENT_DATE WHERE end_date IS NULL;
ALTER TABLE projects ALTER COLUMN project SET NOT NULL;
ALTER TABLE projects ALTER COLUMN client SET NOT NULL;
ALTER TABLE projects ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE projects ALTER COLUMN end_date SET NOT NULL;

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS opened INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS clicked INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_date DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE campaigns SET name = '' WHERE name IS NULL;
UPDATE campaigns SET type = '' WHERE type IS NULL;
UPDATE campaigns SET campaign_date = CURRENT_DATE WHERE campaign_date IS NULL;
ALTER TABLE campaigns ALTER COLUMN name SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN type SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN campaign_date SET NOT NULL;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT ALL ON public.bids TO service_role;
GRANT ALL ON public.bids TO authenticated;

GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.projects TO authenticated;

GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.campaigns TO authenticated;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bids_phase ON bids(phase);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON bids(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- ============================================================
-- RELOAD POSTGREST SCHEMA CACHE
-- ============================================================
NOTIFY pgrst, 'reload schema';
