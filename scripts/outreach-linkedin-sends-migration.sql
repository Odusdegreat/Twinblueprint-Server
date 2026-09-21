-- Apply after outreach-activity-migration.sql (and CRM/sequence migrations).
BEGIN;
CREATE TABLE IF NOT EXISTS public.outreach_linkedin_sends (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (length(btrim(message)) > 0 AND length(message) <= 10000),
  sent_at timestamptz NOT NULL,
  recorded_by bigint NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF to_regclass('public.outreach_linkedin_sends') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='outreach_linkedin_sends' AND column_name='recorded_by' AND data_type='uuid'
  ) THEN
    ALTER TABLE public.outreach_linkedin_sends DROP CONSTRAINT IF EXISTS outreach_linkedin_sends_recorded_by_fkey;
    ALTER TABLE public.outreach_linkedin_sends
      ALTER COLUMN recorded_by TYPE bigint USING recorded_by::bigint,
      ADD CONSTRAINT outreach_linkedin_sends_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS outreach_linkedin_sends_lead_time ON public.outreach_linkedin_sends(lead_id,sent_at);
ALTER TABLE public.outreach_linkedin_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_linkedin_sends FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.outreach_linkedin_sends TO service_role;
CREATE OR REPLACE FUNCTION public.record_outreach_linkedin_send(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.outreach_linkedin_sends%ROWTYPE;
BEGIN
  IF p_input->>'sent_at' IS NULL OR (p_input->>'sent_at')::timestamptz>now()
    OR p_input->>'message' IS NULL OR length(btrim(p_input->>'message'))=0 OR length(p_input->>'message')>10000 THEN
    RAISE EXCEPTION 'A non-empty message and non-future sent_at are required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.outreach_linkedin_sends(id,lead_id,message,sent_at,recorded_by)
    VALUES((p_input->>'id')::uuid,(p_input->>'lead_id')::uuid,p_input->>'message',(p_input->>'sent_at')::timestamptz,(p_input->>'recorded_by')::bigint)
    ON CONFLICT(id) DO NOTHING RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.outreach_linkedin_sends WHERE id=(p_input->>'id')::uuid;
    IF v_row.lead_id IS DISTINCT FROM (p_input->>'lead_id')::uuid
      OR v_row.message IS DISTINCT FROM p_input->>'message'
      OR v_row.sent_at IS DISTINCT FROM (p_input->>'sent_at')::timestamptz
      OR v_row.recorded_by IS DISTINCT FROM (p_input->>'recorded_by')::bigint THEN
      RAISE EXCEPTION 'Activity ID already belongs to a different record' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END $$;
REVOKE ALL ON FUNCTION public.record_outreach_linkedin_send(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_outreach_linkedin_send(jsonb) TO service_role;
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
  SELECT coalesce(v_linkedin,0)+count(*) INTO v_linkedin FROM public.outreach_linkedin_sends WHERE sent_at>=p_start AND sent_at<p_end;
  IF v_meetings THEN
    SELECT count(*) INTO v_booked FROM public.outreach_meetings WHERE booked_at>=p_start AND booked_at<p_end;
  END IF;
  IF v_contacts THEN
    WITH contacts AS (SELECT lead_id,sent_at AS contacted_at FROM public.outreach_linkedin_sends WHERE sent_at>=p_start AND sent_at<p_end UNION ALL
      SELECT lead_id,sent_at AS contacted_at FROM public.email_logs
        WHERE lead_id IS NOT NULL AND sent_at>=p_start AND sent_at<p_end AND channel='email' AND status NOT IN ('failed','bounced')
      UNION ALL
      SELECT q.lead_id,s.completed_at FROM public.outreach_sequence_steps s JOIN public.outreach_sequences q ON q.id=s.sequence_id
        WHERE s.channel IN ('linkedin','phone') AND s.status='completed' AND s.completed_at>=p_start AND s.completed_at<p_end
    ) SELECT count(DISTINCT lead_id) INTO v_denominator FROM contacts;
    IF v_replies THEN
      WITH contacts AS (SELECT lead_id,sent_at AS contacted_at FROM public.outreach_linkedin_sends WHERE sent_at>=p_start AND sent_at<p_end UNION ALL
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
    'availability',jsonb_build_object('linkedin_sent',true,'response_rate',v_contacts AND v_replies,'meetings_booked',v_meetings),
    'sequence_schema_ready',v_sequences AND to_regclass('public.outreach_sequence_attempts') IS NOT NULL
      AND to_regprocedure('public.start_outreach_sequence(uuid,timestamp with time zone,jsonb)') IS NOT NULL
      AND to_regprocedure('public.change_outreach_sequence(uuid,text,jsonb,uuid)') IS NOT NULL
      AND to_regprocedure('public.claim_outreach_email(text)') IS NOT NULL
      AND to_regprocedure('public.finish_outreach_email(uuid,uuid,text,text)') IS NOT NULL);
END $$;


REVOKE ALL ON FUNCTION public.get_outreach_stats(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_outreach_stats(timestamptz,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
