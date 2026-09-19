-- Source currency must never be inferred from a lead's region.
BEGIN;
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS currency text;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='bids_currency_code_check' AND conrelid='public.bids'::regclass) THEN
    ALTER TABLE public.bids ADD CONSTRAINT bids_currency_code_check CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END $$;
COMMENT ON COLUMN public.bids.currency IS 'Explicit source ISO 4217 currency. NULL means unknown; never backfill from geography.';
NOTIFY pgrst,'reload schema';
COMMIT;
