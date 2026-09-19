-- TwinBlueprint CRM expansion. Safe to run after a partial earlier attempt.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'category'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'industry'
  ) THEN
    ALTER TABLE public.leads RENAME COLUMN category TO industry;
  END IF;
END $$;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS industry TEXT;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project_size TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_status TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS applications INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS application_tools JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS temperature TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_phase_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_phase_check
      CHECK (phase IS NULL OR phase IN ('Discovery', 'Bid', 'In-flight'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
      CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_lead_status_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_lead_status_check
      CHECK (lead_status IS NULL OR lead_status IN ('New', 'Identified', 'Bidding', 'Inflight', 'Closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_temperature_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_temperature_check
      CHECK (temperature IN ('hot', 'warm', 'cool'));
  END IF;
END $$;

UPDATE public.leads
SET temperature = CASE
  WHEN score >= 80 THEN 'hot'
  WHEN score >= 50 THEN 'warm'
  ELSE 'cool'
END
WHERE temperature IS NULL;

ALTER TABLE public.leads ALTER COLUMN temperature SET DEFAULT 'cool';
ALTER TABLE public.leads ALTER COLUMN temperature SET NOT NULL;

-- Existing duplicate rows are retained, but this prevents any new duplicate email.
-- The advisory lock makes the check safe when two requests arrive simultaneously.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_lead_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  normalized_email TEXT;
BEGIN
  normalized_email := lower(btrim(NEW.email));
  PERFORM pg_advisory_xact_lock(hashtext(normalized_email)::BIGINT);

  IF EXISTS (
    SELECT 1
    FROM public.leads
    WHERE lower(btrim(email)) = normalized_email
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'A lead with this email already exists'
      USING ERRCODE = '23505';
  END IF;

  NEW.email := normalized_email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_lead_email ON public.leads;
CREATE TRIGGER prevent_duplicate_lead_email
  BEFORE INSERT OR UPDATE OF email ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_lead_email();

ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id);
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS bid_id UUID REFERENCES public.bids(id);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id TEXT UNIQUE,
  lead_id UUID REFERENCES public.leads(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  template TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade an existing email_logs table created before this migration.
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS resend_email_id TEXT;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id);
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id);
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS recipient TEXT;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email';
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS template TEXT;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_leads_region ON public.leads(region);
CREATE INDEX IF NOT EXISTS idx_leads_archived ON public.leads(archived);
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_bids_lead_id ON public.bids(lead_id);
CREATE INDEX IF NOT EXISTS idx_projects_bid_id ON public.projects(bid_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_lead_id ON public.email_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON public.email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_resend_email_id ON public.email_logs(resend_email_id);

-- Atomically create a bid for a lead and advance that lead to the proposal stage.
CREATE OR REPLACE FUNCTION public.move_lead_to_pipeline(
  p_lead_id UUID,
  p_project TEXT,
  p_client TEXT,
  p_phase TEXT,
  p_deadline DATE,
  p_suppliers JSONB DEFAULT '[]'::jsonb,
  p_value NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_bid public.bids%ROWTYPE;
BEGIN
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.bids (project, client, phase, deadline, suppliers, value, lead_id, status)
  VALUES (p_project, p_client, p_phase, p_deadline, p_suppliers, p_value, p_lead_id, 'Active')
  RETURNING * INTO v_bid;

  UPDATE public.leads
  SET status = 'proposal'
  WHERE id = p_lead_id
  RETURNING * INTO v_lead;

  RETURN jsonb_build_object('lead', to_jsonb(v_lead), 'bid', to_jsonb(v_bid));
END;
$$;

REVOKE ALL ON FUNCTION public.move_lead_to_pipeline(UUID, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_lead_to_pipeline(UUID, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC) TO service_role;

GRANT ALL ON public.email_logs TO service_role;
NOTIFY pgrst, 'reload schema';
