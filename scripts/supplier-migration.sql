BEGIN;
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  role TEXT,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tools) = 'array'),
  temperature TEXT CHECK (temperature IN ('hot', 'warm', 'cool')),
  contact JSONB NOT NULL DEFAULT '{"name":null,"job_title":null,"email":null}'::jsonb,
  visualisation_tool TEXT,
  uses_3d BOOLEAN,
  opportunity TEXT,
  pain_points JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pain_points) = 'array')
);
CREATE TABLE IF NOT EXISTS public.bid_suppliers (
  bid_id UUID NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  PRIMARY KEY (bid_id, supplier_id)
);
CREATE TABLE IF NOT EXISTS public.project_suppliers (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, supplier_id)
);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'Planning';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS value NUMERIC;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS currency TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_phase_check') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_phase_check
      CHECK (phase IN ('Planning', 'Design', 'Construction', 'In Progress', 'Completed'));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  bid_id UUID REFERENCES public.bids(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  description TEXT,
  insight TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'qualified', 'won', 'lost')),
  value NUMERIC,
  currency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.opportunity_suppliers (
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  PRIMARY KEY (opportunity_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS opportunities_supplier_id_idx ON public.opportunities(supplier_id);
CREATE INDEX IF NOT EXISTS opportunities_status_idx ON public.opportunities(status);
CREATE INDEX IF NOT EXISTS opportunity_suppliers_supplier_id_idx ON public.opportunity_suppliers(supplier_id);
CREATE INDEX IF NOT EXISTS project_suppliers_supplier_id_idx ON public.project_suppliers(supplier_id);
GRANT ALL ON public.project_suppliers TO service_role;
GRANT ALL ON public.opportunities, public.opportunity_suppliers TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bid_suppliers_supplier_id_idx ON public.bid_suppliers(supplier_id);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_suppliers ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.suppliers, public.bid_suppliers TO service_role;
CREATE OR REPLACE FUNCTION public.set_opportunity_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS opportunities_updated_at ON public.opportunities;
CREATE TRIGGER opportunities_updated_at BEFORE UPDATE ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.set_opportunity_updated_at();
NOTIFY pgrst, 'reload schema';
COMMIT;
