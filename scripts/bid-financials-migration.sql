-- Apply after bid-currency-migration.sql. NULL means the amount or currency is
-- not yet confirmed; non-NULL values must still be finite and valid ISO codes.
BEGIN;
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.bids DROP CONSTRAINT IF EXISTS bids_financials_required;
ALTER TABLE public.bids ADD CONSTRAINT bids_financials_value_valid
  CHECK (value IS NULL OR value::text NOT IN ('NaN','Infinity','-Infinity')) NOT VALID;
ALTER TABLE public.bids ADD CONSTRAINT bids_financials_currency_valid
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$') NOT VALID;
-- NOT VALID preserves historical rows; validate both constraints after repair.
DROP FUNCTION IF EXISTS public.move_lead_to_pipeline(uuid,text,text,text,date,jsonb,numeric);
CREATE OR REPLACE FUNCTION public.move_lead_to_pipeline(
  p_lead_id uuid,p_project text,p_client text,p_phase text,p_deadline date,
  p_suppliers jsonb,p_value numeric,p_currency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_lead public.leads%ROWTYPE; v_bid public.bids%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id=p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.bids(project,client,phase,deadline,suppliers,value,currency,lead_id,status)
    VALUES(p_project,p_client,p_phase,p_deadline,p_suppliers,p_value,p_currency,p_lead_id,'Active') RETURNING * INTO v_bid;
  UPDATE public.leads SET status='proposal' WHERE id=p_lead_id RETURNING * INTO v_lead;
  RETURN jsonb_build_object('lead',to_jsonb(v_lead),'bid',to_jsonb(v_bid));
END $$;
REVOKE ALL ON FUNCTION public.move_lead_to_pipeline(uuid,text,text,text,date,jsonb,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.move_lead_to_pipeline(uuid,text,text,text,date,jsonb,numeric,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;