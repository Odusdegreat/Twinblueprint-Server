-- State and region group must be recorded explicitly per lead for the enrichment pipeline.
BEGIN;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS region_group text;
COMMENT ON COLUMN public.leads.state IS 'Administrative subdivision (state/province/department/district) of the lead country. NULL means unassigned.';
COMMENT ON COLUMN public.leads.region_group IS 'Broad global cluster (Americas/EMEA/APAC/Other). NULL means unassigned.';
NOTIFY pgrst,'reload schema';
COMMIT;