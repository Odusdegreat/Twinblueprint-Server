-- Outreach reply and meeting tracking. Apply after the CRM and sequence migrations.
-- Metrics tolerate missing sequence tables and report unavailable metrics as null.
BEGIN;
CREATE TABLE IF NOT EXISTS public.outreach_replies (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('linkedin','email','phone')),
  replied_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_replies_lead_time ON public.outreach_replies(lead_id,replied_at);
CREATE TABLE IF NOT EXISTS public.outreach_meetings (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  booked_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','completed','cancelled','no_show')),
  outcome text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id,scheduled_at)
);
CREATE INDEX IF NOT EXISTS outreach_meetings_booked ON public.outreach_meetings(booked_at);
ALTER TABLE public.outreach_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_meetings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.outreach_replies,public.outreach_meetings TO service_role;

CREATE OR REPLACE FUNCTION public.record_outreach_reply(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.outreach_replies%ROWTYPE;
BEGIN
  IF (p_input->>'replied_at')::timestamptz>now() THEN RAISE EXCEPTION 'Reply time cannot be in the future' USING ERRCODE='22023'; END IF;
  INSERT INTO public.outreach_replies(id,lead_id,channel,replied_at,notes)
    VALUES((p_input->>'id')::uuid,(p_input->>'lead_id')::uuid,p_input->>'channel',coalesce((p_input->>'replied_at')::timestamptz,now()),p_input->>'notes')
    ON CONFLICT(id) DO NOTHING RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.outreach_replies WHERE id=(p_input->>'id')::uuid;
    IF v_row.lead_id IS DISTINCT FROM (p_input->>'lead_id')::uuid OR v_row.channel IS DISTINCT FROM p_input->>'channel'
      OR (p_input ? 'replied_at' AND v_row.replied_at IS DISTINCT FROM (p_input->>'replied_at')::timestamptz)
      OR v_row.notes IS DISTINCT FROM p_input->>'notes' THEN RAISE EXCEPTION 'Reply ID already belongs to a different record'; END IF;
    RETURN to_jsonb(v_row);
  END IF;
  -- Only new reply records pause; replaying an old request must not re-pause a resumed sequence.
  IF to_regclass('public.outreach_sequences') IS NOT NULL THEN
    UPDATE public.outreach_sequences SET status='paused',pause_reason='reply',updated_at=now()
      WHERE lead_id=v_row.lead_id AND status='active' AND start_at<=v_row.replied_at;
  END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.record_outreach_meeting(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.outreach_meetings%ROWTYPE;
BEGIN
  IF (p_input->>'booked_at')::timestamptz>now() THEN RAISE EXCEPTION 'Booking time cannot be in the future' USING ERRCODE='22023'; END IF;
  INSERT INTO public.outreach_meetings(id,lead_id,booked_at,scheduled_at,notes)
    VALUES((p_input->>'id')::uuid,(p_input->>'lead_id')::uuid,coalesce((p_input->>'booked_at')::timestamptz,now()),(p_input->>'scheduled_at')::timestamptz,p_input->>'notes')
    ON CONFLICT(id) DO NOTHING RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.outreach_meetings WHERE id=(p_input->>'id')::uuid;
    IF v_row.lead_id IS DISTINCT FROM (p_input->>'lead_id')::uuid THEN RAISE EXCEPTION 'Meeting ID already belongs to another lead'; END IF;
    -- POST retries return the current meeting, preserving any later rescheduling/outcome edits.
  END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.get_outreach_stats(p_start timestamptz,p_end timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_sequences boolean := to_regclass('public.outreach_sequences') IS NOT NULL AND to_regclass('public.outreach_sequence_steps') IS NOT NULL;
  v_contacts boolean;
  v_replies boolean := to_regclass('public.outreach_replies') IS NOT NULL;
  v_meetings boolean := to_regclass('public.outreach_meetings') IS NOT NULL;
  v_linkedin bigint; v_numerator bigint; v_denominator bigint; v_booked bigint; v_rate numeric;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start>=p_end THEN RAISE EXCEPTION 'Invalid reporting period' USING ERRCODE='22023'; END IF;
  v_contacts := v_sequences AND to_regclass('public.email_logs') IS NOT NULL;
  IF v_sequences THEN
    SELECT count(*) INTO v_linkedin FROM public.outreach_sequence_steps
      WHERE channel='linkedin' AND status='completed' AND completed_at>=p_start AND completed_at<p_end;
  END IF;
  IF v_meetings THEN
    SELECT count(*) INTO v_booked FROM public.outreach_meetings WHERE booked_at>=p_start AND booked_at<p_end;
  END IF;
  IF v_contacts THEN
    WITH contacts AS (
      SELECT lead_id,sent_at AS contacted_at FROM public.email_logs
        WHERE lead_id IS NOT NULL AND sent_at>=p_start AND sent_at<p_end AND channel='email' AND status NOT IN ('failed','bounced')
      UNION ALL
      SELECT q.lead_id,s.completed_at FROM public.outreach_sequence_steps s JOIN public.outreach_sequences q ON q.id=s.sequence_id
        WHERE s.channel IN ('linkedin','phone') AND s.status='completed' AND s.completed_at>=p_start AND s.completed_at<p_end
    ) SELECT count(DISTINCT lead_id) INTO v_denominator FROM contacts;
    IF v_replies THEN
      WITH contacts AS (
        SELECT lead_id,sent_at AS contacted_at FROM public.email_logs
          WHERE lead_id IS NOT NULL AND sent_at>=p_start AND sent_at<p_end AND channel='email' AND status NOT IN ('failed','bounced')
        UNION ALL
        SELECT q.lead_id,s.completed_at FROM public.outreach_sequence_steps s JOIN public.outreach_sequences q ON q.id=s.sequence_id
          WHERE s.channel IN ('linkedin','phone') AND s.status='completed' AND s.completed_at>=p_start AND s.completed_at<p_end
      ), first_contacts AS (SELECT lead_id,min(contacted_at) AS contacted_at FROM contacts GROUP BY lead_id)
      SELECT count(DISTINCT c.lead_id) INTO v_numerator FROM first_contacts c JOIN public.outreach_replies r ON r.lead_id=c.lead_id
        WHERE r.replied_at>=c.contacted_at AND r.replied_at>=p_start AND r.replied_at<p_end;
      v_rate := CASE WHEN v_denominator=0 THEN 0 ELSE round(100.0*v_numerator/v_denominator,2) END;
    END IF;
  END IF;
  RETURN jsonb_build_object('linkedin_sent',v_linkedin,'response_rate',v_rate,'meetings_booked',v_booked,
    'response_rate_numerator',v_numerator,'response_rate_denominator',v_denominator,
    'availability',jsonb_build_object('linkedin_sent',v_sequences,'response_rate',v_contacts AND v_replies,'meetings_booked',v_meetings),
    'sequence_schema_ready',v_sequences AND to_regclass('public.outreach_sequence_attempts') IS NOT NULL
      AND to_regprocedure('public.start_outreach_sequence(uuid,timestamp with time zone,jsonb)') IS NOT NULL
      AND to_regprocedure('public.change_outreach_sequence(uuid,text,jsonb,uuid)') IS NOT NULL
      AND to_regprocedure('public.claim_outreach_email(text)') IS NOT NULL
      AND to_regprocedure('public.finish_outreach_email(uuid,uuid,text,text)') IS NOT NULL);
END $$;

REVOKE ALL ON FUNCTION public.record_outreach_reply(jsonb),public.record_outreach_meeting(jsonb),public.get_outreach_stats(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_outreach_reply(jsonb),public.record_outreach_meeting(jsonb),public.get_outreach_stats(timestamptz,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
