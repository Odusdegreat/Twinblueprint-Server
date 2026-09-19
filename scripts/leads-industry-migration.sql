-- Repair legacy leads.category without rerunning the full migration.
-- Renaming preserves existing values, constraints, and indexes.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='category'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='industry'
  ) THEN
    ALTER TABLE public.leads RENAME COLUMN category TO industry;
  END IF;
END $$;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS industry TEXT;
NOTIFY pgrst, 'reload schema';
COMMIT;
