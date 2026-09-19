-- Disposable local PostgreSQL database only. Run with psql -v ON_ERROR_STOP=1.
DO $$ BEGIN
  IF current_database()<>'leads_country_test' THEN RAISE EXCEPTION 'Use the disposable leads_country_test database'; END IF;
END $$;
CREATE TABLE public.leads(id integer PRIMARY KEY);
INSERT INTO public.leads(id) VALUES(1);
\ir leads-country-migration.sql
INSERT INTO public.leads(id,country) VALUES(2,'United Kingdom');
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS region text;
INSERT INTO public.leads(id,region) VALUES(3,'EMEA');
\ir leads-country-migration.sql
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='country'), 'country column must exist';
  ASSERT (SELECT country='United Kingdom' FROM public.leads WHERE id=2), 'Existing country values must be preserved';
  ASSERT (SELECT country IS NULL FROM public.leads WHERE id=3), 'Leads without country must remain NULL';
  RAISE NOTICE 'Passed leads country column insert, rerun, and preservation checks';
END $$;