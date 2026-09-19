-- One-off backfill for records created before explicit currency/country existed.
-- Backfills from region as an explicit user decision. Ingest from an approved source going forward.
BEGIN;

UPDATE public.bids b
SET currency = l.region_currency
FROM (
  SELECT l2.id AS lead_id, l2.region,
    CASE l2.region
      WHEN 'UK & Ireland' THEN 'GBP'
      WHEN 'DACH / Northern Europe' THEN 'EUR'
      WHEN 'Southern Europe' THEN 'EUR'
      WHEN 'Middle East (GCC)' THEN 'USD'
      WHEN 'Africa' THEN 'USD'
      WHEN 'North America' THEN 'USD'
      WHEN 'Latin America' THEN 'USD'
    END AS region_currency
  FROM public.leads l2
) l
WHERE b.lead_id = l.lead_id
  AND b.currency IS NULL
  AND l.region_currency IS NOT NULL;

UPDATE public.leads
SET country = 'Nigeria'
WHERE region = 'Africa' AND country IS NULL;

UPDATE public.leads
SET country = 'United Kingdom'
WHERE region = 'UK & Ireland' AND country IS NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;