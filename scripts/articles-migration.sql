-- ============================================================
-- TwinBlueprint — Articles Table Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- ARTICLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auto_seo_id TEXT UNIQUE NOT NULL,           -- Auto-SEO article GUID/ID (e.g., https://auto-seo.co.uk/article/1501)
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,                      -- Full HTML content from content:encoded
    featured_image TEXT,                        -- First image URL from content
    category TEXT,                              -- Category from RSS <category>
    tags TEXT[],                                -- Array of tags (derived from category)
    author TEXT DEFAULT 'Auto-SEO',             -- Author (default to Auto-SEO)
    published_at TIMESTAMPTZ NOT NULL,          -- Publication date from RSS <pubDate>
    seo_title TEXT,                             -- SEO title (defaults to title)
    seo_description TEXT,                       -- SEO description (defaults to excerpt)
    status TEXT NOT NULL DEFAULT 'published',   -- 'published' | 'draft'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_articles_auto_seo_id ON articles(auto_seo_id);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);

-- ============================================================
-- GRANTS
-- ============================================================
GRANT ALL ON public.articles TO service_role;
GRANT ALL ON public.articles TO authenticated;

-- ============================================================
-- RELOAD POSTGREST SCHEMA CACHE
-- ============================================================
NOTIFY pgrst, 'reload schema';