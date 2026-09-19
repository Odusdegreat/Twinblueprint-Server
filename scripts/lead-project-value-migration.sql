-- Numeric project size + explicit currency, mirroring bids.
-- Backfills existing rows from the pre-formatted project_size string:
--  - currency is read from the embedded symbol ($ = USD, € = EUR, £ = GBP, ₦ = NGN)
--  - project_value uses the lower bound of a range ($800M-$900M = 800000000)
-- New records should set project_value and currency explicitly going forward.
BEGIN;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project_value numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS currency text;

WITH parsed AS (
  SELECT id,
    (regexp_match(project_size, '([0-9]+(?:\.[0-9]+)?)\s*([KMB])'))[1]::numeric AS amount,
    upper((regexp_match(project_size, '([0-9]+(?:\.[0-9]+)?)\s*([KMB])'))[2]) AS unit
  FROM public.leads
  WHERE project_size IS NOT NULL AND project_value IS NULL
)
UPDATE public.leads l
SET project_value = round(p.amount * CASE p.unit WHEN 'K' THEN 1000 WHEN 'M' THEN 1000000 WHEN 'B' THEN 1000000000 END)
FROM parsed p
WHERE p.id = l.id;

UPDATE public.leads
SET currency = CASE
  WHEN project_size LIKE '%€%' THEN 'EUR'
  WHEN project_size LIKE '%£%' THEN 'GBP'
  WHEN project_size LIKE '%₦%' THEN 'NGN'
  WHEN project_size LIKE '%$%' THEN 'USD'
END
WHERE currency IS NULL AND project_size IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='leads_project_value_check' AND conrelid='public.leads'::regclass) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_project_value_check CHECK(project_value IS NULL OR project_value >= 0);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='leads_currency_code_check' AND conrelid='public.leads'::regclass) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_currency_code_check CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END $$;

COMMENT ON COLUMN public.leads.project_value IS 'Explicit numeric lead deal size in currency units. NULL means unknown; lower bound of a range when derived from legacy project_size.';
COMMENT ON COLUMN public.leads.currency IS 'Explicit source ISO 4217 currency. NULL means unknown; never backfill from geography.';
NOTIFY pgrst,'reload schema';
COMMIT;