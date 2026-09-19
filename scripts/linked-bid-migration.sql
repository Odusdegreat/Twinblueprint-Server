-- Run after crm-migration.sql. Enforce one bid per linked lead, including
-- concurrent creates and relinks. Unlinked bids remain unrestricted.
-- If legacy duplicates exist this fails without deleting any records;
-- resolve those records explicitly before rerunning.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bids_unique_lead_id
  ON public.bids (lead_id) WHERE lead_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
