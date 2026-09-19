-- Country must be recorded explicitly per lead, never inferred from region or company name.
BEGIN;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS country text;
COMMENT ON COLUMN public.leads.country IS 'Explicit recorded country. NULL means unassigned; country labels are normalized by the approved source, never inferred from geography or company names.';
NOTIFY pgrst,'reload schema';
COMMIT;