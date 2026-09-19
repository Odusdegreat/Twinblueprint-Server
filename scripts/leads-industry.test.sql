-- Disposable local PostgreSQL database only. Run with psql -v ON_ERROR_STOP=1.
DO $$ BEGIN
  IF current_database()<>'lead_industry_test' THEN RAISE EXCEPTION 'Use the disposable lead_industry_test database'; END IF;
END $$;
CREATE TABLE public.leads(id integer PRIMARY KEY, category text NOT NULL);
INSERT INTO public.leads VALUES(1,'Construction');
\ir leads-industry-migration.sql
DO $$ BEGIN
  ASSERT (SELECT industry='Construction' FROM public.leads WHERE id=1), 'Rename must preserve existing values';
  ASSERT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='category'), 'Legacy name should be gone';
END $$;
\ir leads-industry-migration.sql
INSERT INTO public.leads(id,industry) VALUES(2,'Engineering');
DO $$ BEGIN
  ASSERT (SELECT count(*)=2 FROM public.leads), 'Repair must be rerunnable and accept industry inserts';
END $$;
DROP TABLE public.leads;
CREATE TABLE public.leads(id integer PRIMARY KEY);
\ir leads-industry-migration.sql
INSERT INTO public.leads(id,industry) VALUES(3,'Architecture');
DO $$ BEGIN
  ASSERT (SELECT industry='Architecture' FROM public.leads WHERE id=3), 'Missing column must be added';
  RAISE NOTICE 'Passed industry migration data preservation, rerun, and insertion checks';
END $$;
