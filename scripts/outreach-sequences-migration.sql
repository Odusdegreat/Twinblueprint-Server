-- Apply after full-migration.sql and crm-migration.sql. No extensions required.
BEGIN;
CREATE TABLE IF NOT EXISTS public.outreach_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled','completed')),
  start_at timestamptz NOT NULL,
  pause_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS outreach_one_live_sequence ON public.outreach_sequences(lead_id) WHERE status IN ('active','paused');
CREATE INDEX IF NOT EXISTS outreach_sequences_lead ON public.outreach_sequences(lead_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.outreach_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.outreach_sequences(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 4),
  channel text NOT NULL CHECK (channel IN ('linkedin','email','phone')),
  due_at timestamptz NOT NULL,
  message text NOT NULL CHECK (length(btrim(message)) > 0),
  subject text,
  status text NOT NULL CHECK (status IN ('pending','scheduled','sent','completed','failed','skipped')),
  completed_at timestamptz,
  notes text,
  email_log_id uuid UNIQUE REFERENCES public.email_logs(id),
  attempt_count integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  payload jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sequence_id,position),
  CHECK (channel <> 'email' OR (subject IS NOT NULL AND length(btrim(subject)) > 0)),
  CHECK ((position = 1 AND channel = 'linkedin') OR (position IN (2,3) AND channel = 'email') OR (position = 4 AND channel IN ('phone','email')))
);
CREATE INDEX IF NOT EXISTS outreach_due_steps ON public.outreach_sequence_steps(due_at,next_attempt_at) WHERE status = 'scheduled';
CREATE TABLE IF NOT EXISTS public.outreach_sequence_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.outreach_sequence_steps(id) ON DELETE CASCADE,
  attempt integer NOT NULL,
  lease_token uuid NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','failed','unknown')),
  error text,
  resend_email_id text,
  UNIQUE(step_id,attempt)
);
ALTER TABLE public.outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sequence_attempts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.outreach_sequences, public.outreach_sequence_steps, public.outreach_sequence_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.start_outreach_sequence(p_lead_id uuid,p_start_at timestamptz,p_steps jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_lead public.leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id=p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found' USING ERRCODE='P0002'; END IF;
  IF v_lead.archived OR v_lead.status IN ('won','lost') OR v_lead.lead_status='Closed' THEN
    RAISE EXCEPTION 'Cannot start a sequence for an archived or closed lead';
  END IF;
  IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps) <> 4 THEN
    RAISE EXCEPTION 'Exactly four steps are required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.outreach_sequences(lead_id,start_at) VALUES(p_lead_id,p_start_at) RETURNING id INTO v_id;
  INSERT INTO public.outreach_sequence_steps(sequence_id,position,channel,due_at,message,subject,status)
    SELECT v_id,x.position,x.channel,x.due_at,x.message,x.subject,CASE WHEN x.channel='email' THEN 'scheduled' ELSE 'pending' END
    FROM jsonb_to_recordset(p_steps) AS x(position integer,channel text,due_at timestamptz,message text,subject text);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.change_outreach_sequence(p_sequence_id uuid,p_action text,p_input jsonb DEFAULT '{}',p_step_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seq public.outreach_sequences%ROWTYPE; v_step public.outreach_sequence_steps%ROWTYPE;
BEGIN
  SELECT * INTO v_seq FROM public.outreach_sequences WHERE id=p_sequence_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sequence not found' USING ERRCODE='P0002'; END IF;
  IF p_action='cancel' AND v_seq.status='cancelled' THEN RETURN; END IF;
  IF v_seq.status NOT IN ('active','paused') THEN RAISE EXCEPTION 'Sequence is no longer active'; END IF;
  IF p_action IN ('pause','resume','cancel') THEN
    IF p_action='resume' AND EXISTS(SELECT 1 FROM public.leads WHERE id=v_seq.lead_id AND (archived OR status IN ('won','lost') OR lead_status='Closed')) THEN
      RAISE EXCEPTION 'Cannot resume an archived or closed lead';
    END IF;
    UPDATE public.outreach_sequences SET
      status=CASE p_action WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'active' ELSE 'cancelled' END,
      pause_reason=CASE WHEN p_action='pause' THEN coalesce(p_input->>'reason','manual') ELSE NULL END,
      notes=coalesce(p_input->>'notes',notes),updated_at=now() WHERE id=p_sequence_id;
    IF p_action='cancel' THEN
      UPDATE public.outreach_sequence_steps SET status='skipped',notes=coalesce(notes,'Sequence cancelled'),updated_at=now()
      WHERE sequence_id=p_sequence_id AND status IN ('pending','scheduled') AND lease_token IS NULL;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO v_step FROM public.outreach_sequence_steps WHERE id=p_step_id AND sequence_id=p_sequence_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sequence step not found' USING ERRCODE='P0002'; END IF;
  IF p_action='complete' AND v_step.status='completed' THEN RETURN; END IF;
  IF p_action='skip' AND v_step.status='skipped' THEN RETURN; END IF;
  IF v_step.lease_token IS NOT NULL THEN RAISE EXCEPTION 'Step has a delivery in progress or awaiting reconciliation'; END IF;
  IF v_step.status NOT IN ('pending','scheduled','failed') THEN RAISE EXCEPTION 'Step is already finished'; END IF;
  IF p_action='edit' THEN
    IF v_step.attempt_count>0 THEN RAISE EXCEPTION 'Attempted email payloads cannot be edited or rescheduled'; END IF;
    UPDATE public.outreach_sequence_steps SET due_at=coalesce((p_input->>'due_at')::timestamptz,due_at),
      message=coalesce(p_input->>'message',message),subject=coalesce(p_input->>'subject',subject),updated_at=now() WHERE id=p_step_id;
  ELSIF p_action='complete' THEN
    IF v_step.channel='email' THEN RAISE EXCEPTION 'Email steps must be sent by the scheduler'; END IF;
    IF (p_input->>'completed_at')::timestamptz > now() THEN RAISE EXCEPTION 'Completion time cannot be in the future' USING ERRCODE='22023'; END IF;
    UPDATE public.outreach_sequence_steps SET status='completed',completed_at=coalesce((p_input->>'completed_at')::timestamptz,now()),notes=p_input->>'notes',updated_at=now() WHERE id=p_step_id;
  ELSIF p_action='skip' THEN
    UPDATE public.outreach_sequence_steps SET status='skipped',notes=p_input->>'notes',updated_at=now() WHERE id=p_step_id;
  ELSE RAISE EXCEPTION 'Unknown sequence action' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.outreach_sequence_steps WHERE sequence_id=p_sequence_id AND status NOT IN ('sent','completed','skipped')) THEN
    UPDATE public.outreach_sequences SET status='completed',updated_at=now() WHERE id=p_sequence_id;
  END IF;
END $$;

-- Database trigger covers archiving/outcomes regardless of which API writes the lead.
CREATE OR REPLACE FUNCTION public.stop_lead_outreach_sequences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.archived OR NEW.status IN ('won','lost') OR NEW.lead_status='Closed' THEN
    UPDATE public.outreach_sequences SET status=CASE WHEN NEW.archived THEN 'cancelled' ELSE 'paused' END,
      pause_reason=CASE WHEN NEW.archived THEN 'lead_archived' ELSE 'deal_outcome' END,updated_at=now()
      WHERE lead_id=NEW.id AND status IN ('active','paused');
    IF NEW.archived THEN
      UPDATE public.outreach_sequence_steps SET status='skipped',notes=coalesce(notes,'Lead archived'),updated_at=now()
      WHERE sequence_id IN (SELECT id FROM public.outreach_sequences WHERE lead_id=NEW.id AND status='cancelled')
        AND status IN ('pending','scheduled') AND lease_token IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stop_lead_outreach_sequences ON public.leads;
CREATE TRIGGER stop_lead_outreach_sequences AFTER UPDATE OF archived,status,lead_status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.stop_lead_outreach_sequences();

CREATE OR REPLACE FUNCTION public.fail_outreach_email_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('failed','bounced') THEN
    UPDATE public.outreach_sequence_steps SET status='failed',last_error='Email provider reported '||NEW.status,
      next_attempt_at=NULL,updated_at=now() WHERE email_log_id=NEW.id AND status='sent';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fail_outreach_email_delivery ON public.email_logs;
CREATE TRIGGER fail_outreach_email_delivery AFTER UPDATE OF status ON public.email_logs
FOR EACH ROW EXECUTE FUNCTION public.fail_outreach_email_delivery();

-- Claim one job at a time. A five-minute lease recovers crashed workers.
-- Payload and idempotency key never change after the first attempt.
CREATE OR REPLACE FUNCTION public.claim_outreach_email(p_from text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_seq public.outreach_sequences%ROWTYPE; v_step public.outreach_sequence_steps%ROWTYPE; v_token uuid; v_recipient text;
BEGIN
  FOR v_seq IN SELECT q.* FROM public.outreach_sequences q
    WHERE EXISTS(SELECT 1 FROM public.outreach_sequence_steps s WHERE s.sequence_id=q.id AND s.status='scheduled'
      AND s.due_at<=now() AND (s.next_attempt_at IS NULL OR s.next_attempt_at<=now())
      AND (s.lease_until IS NULL OR s.lease_until<=now()))
    ORDER BY q.created_at FOR UPDATE SKIP LOCKED
  LOOP
    FOR v_step IN SELECT * FROM public.outreach_sequence_steps WHERE sequence_id=v_seq.id AND status='scheduled'
      AND due_at<=now() AND (next_attempt_at IS NULL OR next_attempt_at<=now())
      AND (lease_until IS NULL OR lease_until<=now()) ORDER BY due_at,position FOR UPDATE SKIP LOCKED
    LOOP
      IF v_step.lease_token IS NOT NULL THEN
        UPDATE public.outreach_sequence_attempts SET status='unknown',error='Worker lease expired; delivery may have been accepted',finished_at=now()
          WHERE lease_token=v_step.lease_token AND status='sending';
      END IF;
      IF v_seq.status <> 'active' OR EXISTS(SELECT 1 FROM public.leads WHERE id=v_seq.lead_id AND (archived OR status IN ('won','lost') OR lead_status='Closed')) THEN
        -- Never retry an in-flight email once controls stop it. Keep uncertain sends visible.
        UPDATE public.outreach_sequence_steps SET
          status=CASE WHEN attempt_count>0 THEN 'failed' WHEN v_seq.status='cancelled' THEN 'skipped' ELSE status END,
          last_error=CASE WHEN attempt_count>0 THEN 'Delivery uncertain; sequence stopped before reconciliation' ELSE last_error END,
          lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=v_step.id;
        CONTINUE;
      END IF;
      IF v_step.attempt_count>=5 OR v_step.first_attempt_at <= now()-interval '23 hours' THEN
        UPDATE public.outreach_sequence_steps SET status='failed',last_error='Retry limit or safe idempotency window exhausted; verify delivery before further contact',
          lease_token=NULL,lease_until=NULL,next_attempt_at=NULL,updated_at=now() WHERE id=v_step.id;
        CONTINUE;
      END IF;
      SELECT email INTO v_recipient FROM public.leads WHERE id=v_seq.lead_id;
      v_token:=gen_random_uuid();
      UPDATE public.outreach_sequence_steps SET attempt_count=attempt_count+1,first_attempt_at=coalesce(first_attempt_at,now()),
        lease_token=v_token,lease_until=now()+interval '5 minutes',
        payload=coalesce(payload,jsonb_build_object('from',p_from,'to',v_recipient,'subject',subject,'html',message)),updated_at=now()
        WHERE id=v_step.id RETURNING * INTO v_step;
      INSERT INTO public.outreach_sequence_attempts(step_id,attempt,lease_token) VALUES(v_step.id,v_step.attempt_count,v_token);
      RETURN jsonb_build_object('id',v_step.id,'sequence_id',v_seq.id,'lease_token',v_token,'payload',v_step.payload,
        'idempotency_key','outreach-step/'||v_step.id,'first_attempt_at',v_step.first_attempt_at);
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

-- Persist provider acceptance and its email log in one transaction.
CREATE OR REPLACE FUNCTION public.finish_outreach_email(p_step_id uuid,p_token uuid,p_email_id text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_seq public.outreach_sequences%ROWTYPE; v_step public.outreach_sequence_steps%ROWTYPE; v_log_id uuid;
BEGIN
  SELECT q.* INTO v_seq FROM public.outreach_sequences q JOIN public.outreach_sequence_steps s ON s.sequence_id=q.id WHERE s.id=p_step_id FOR UPDATE OF q;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_step FROM public.outreach_sequence_steps WHERE id=p_step_id FOR UPDATE;
  IF v_step.lease_token IS DISTINCT FROM p_token THEN RETURN; END IF;
  IF p_email_id IS NOT NULL AND length(p_email_id)>0 THEN
    INSERT INTO public.email_logs(resend_email_id,lead_id,recipient,subject,channel,template,status,sent_at)
      VALUES(p_email_id,v_seq.lead_id,v_step.payload->>'to',v_step.payload->>'subject','email',v_step.payload->>'html','sent',now()) RETURNING id INTO v_log_id;
    UPDATE public.outreach_sequence_steps SET status='sent',email_log_id=v_log_id,completed_at=now(),last_error=NULL,next_attempt_at=NULL,
      lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_step_id;
    UPDATE public.outreach_sequence_attempts SET status='sent',resend_email_id=p_email_id,finished_at=now() WHERE lease_token=p_token;
  ELSE
    UPDATE public.outreach_sequence_steps SET
      status=CASE WHEN attempt_count>=5 OR first_attempt_at<=now()-interval '23 hours' OR v_seq.status<>'active' THEN 'failed' ELSE 'scheduled' END,
      next_attempt_at=CASE WHEN attempt_count>=5 OR first_attempt_at<=now()-interval '23 hours' OR v_seq.status<>'active' THEN NULL
        ELSE now()+make_interval(secs => (60*power(2,attempt_count-1))::integer) END,
      last_error=left(coalesce(p_error,'Unknown delivery failure'),2000),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_step_id;
    UPDATE public.outreach_sequence_attempts SET status='failed',error=left(coalesce(p_error,'Unknown delivery failure'),2000),finished_at=now() WHERE lease_token=p_token;
  END IF;
  IF v_seq.status IN ('active','paused') AND NOT EXISTS(SELECT 1 FROM public.outreach_sequence_steps WHERE sequence_id=v_seq.id AND status NOT IN ('sent','completed','skipped')) THEN
    UPDATE public.outreach_sequences SET status='completed',updated_at=now() WHERE id=v_seq.id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.start_outreach_sequence(uuid,timestamptz,jsonb),public.change_outreach_sequence(uuid,text,jsonb,uuid),public.claim_outreach_email(text),public.finish_outreach_email(uuid,uuid,text,text),public.stop_lead_outreach_sequences(),public.fail_outreach_email_delivery() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_outreach_sequence(uuid,timestamptz,jsonb),public.change_outreach_sequence(uuid,text,jsonb,uuid),public.claim_outreach_email(text),public.finish_outreach_email(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
