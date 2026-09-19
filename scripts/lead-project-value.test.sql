-- Disposable local PostgreSQL database only. Run with psql -v ON_ERROR_STOP=1.
DO $$ BEGIN
  IF current_database()<>'lead_project_value_test' THEN RAISE EXCEPTION 'Use the disposable lead_project_value_test database'; END IF;
END $$;
CREATE TABLE public.leads(id integer PRIMARY KEY, project_size text);
INSERT INTO public.leads(id,project_size) VALUES
  (1,'$800M-$900M'),
  (2,'$20M-$50M'),
  (3,'$80M'),
  (4,'$500M'),
  (5,'$50M-$70M'),
  (6,'€1B+'),
  (7,NULL);
\ir lead-project-value-migration.sql
\ir lead-project-value-migration.sql
DO $$ BEGIN
  ASSERT (SELECT project_value=800000000 AND currency='USD' FROM public.leads WHERE id=1), 'Range must use the lower bound with USD';
  ASSERT (SELECT project_value=20000000 AND currency='USD' FROM public.leads WHERE id=2), 'Multi-hyphen range must use the lower bound with USD';
  ASSERT (SELECT project_value=80000000 AND currency='USD' FROM public.leads WHERE id=3), 'Single value must parse to the amount with USD';
  ASSERT (SELECT project_value=500000000 AND currency='USD' FROM public.leads WHERE id=4), 'Single value must parse to the amount with USD';
  ASSERT (SELECT project_value=50000000 AND currency='USD' FROM public.leads WHERE id=5), 'Range must use the lower bound with USD';
  ASSERT (SELECT project_value=1000000000 AND currency='EUR' FROM public.leads WHERE id=6), 'B suffix must scale and euro symbol must map to EUR';
  ASSERT (SELECT project_value IS NULL AND currency IS NULL FROM public.leads WHERE id=7), 'NULL project_size must stay NULL';
  ASSERT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='leads_project_value_check' AND conrelid='public.leads'::regclass), 'project_value check constraint must exist';
  ASSERT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='leads_currency_code_check' AND conrelid='public.leads'::regclass), 'currency check constraint must exist';
  RAISE NOTICE 'Passed lead project_value backfill, rerun, and constraint checks';
END $$;