-- Migration: Fix bids table (was created with wrong column types)
-- Run this in Supabase SQL Editor

-- Drop the broken bids table entirely
DROP TABLE IF EXISTS public.bids CASCADE;

-- Recreate with correct schema
CREATE TABLE IF NOT EXISTS public.bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project TEXT NOT NULL,
    client TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'RFP Review',
    deadline DATE NOT NULL,
    suppliers JSONB DEFAULT '[]'::jsonb,
    value NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Grants
GRANT ALL ON public.bids TO service_role;
GRANT ALL ON public.bids TO authenticated;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bids_phase ON public.bids(phase);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON public.bids(created_at DESC);

-- Fix campaigns table if needed (drop and recreate to be safe)
DROP TABLE IF EXISTS public.campaigns CASCADE;

CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    sent INTEGER DEFAULT 0,
    opened INTEGER DEFAULT 0,
    clicked INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active',
    campaign_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.campaigns TO authenticated;

CREATE INDEX IF NOT EXISTS idx_campaigns_type ON public.campaigns(type);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON public.campaigns(created_at DESC);
