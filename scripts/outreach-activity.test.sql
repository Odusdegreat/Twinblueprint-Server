-- Run only on the disposable local outreach_sequences_test database after its fixture setup.
-- Apply outreach-activity-migration.sql first. All test changes are rolled back.
BEGIN;
DO $$
DECLARE
  v_a uuid; v_b uuid; v_c uuid; v_q uuid; v_future_q uuid; v_meeting uuid:=gen_random_uuid(); v_reply uuid:=gen_random_uuid(); v_stats jsonb; v_record jsonb;
BEGIN
  IF current_database()<>'outreach_sequences_test' THEN RAISE EXCEPTION 'Use the disposable outreach_sequences_test database only'; END IF;
  v_stats:=get_outreach_stats('2026-01-01Z','2026-02-01Z');
  ASSERT v_stats->>'linkedin_sent'='0' AND v_stats->>'response_rate'='0' AND v_stats->>'meetings_booked'='0','Empty installed metrics must be zero';
  INSERT INTO leads(email) VALUES('metrics-a@example.test') RETURNING id INTO v_a;
  INSERT INTO leads(email) VALUES('metrics-b@example.test') RETURNING id INTO v_b;
  INSERT INTO leads(email) VALUES('metrics-c@example.test') RETURNING id INTO v_c;
  INSERT INTO outreach_sequences(lead_id,start_at) VALUES(v_a,'2026-01-01Z') RETURNING id INTO v_q;
  INSERT INTO outreach_sequence_steps(sequence_id,position,channel,message,due_at,status,completed_at)
    VALUES(v_q,1,'linkedin','Manual contact','2026-01-05Z','completed','2026-01-05Z'),
          (v_q,4,'phone','Not completed','2026-01-15Z','pending',NULL);
  INSERT INTO email_logs(lead_id,recipient,subject,sent_at,status) VALUES
    (v_a,'metrics-a@example.test','Same lead twice','2026-01-06Z','sent'),
    (v_a,'metrics-a@example.test','Same lead twice','2026-01-07Z','sent'),
    (v_b,'metrics-b@example.test','Contact B','2026-01-06Z','delivered'),
    (v_c,'metrics-c@example.test','Contact C','2026-01-07Z','sent'),
    (v_c,'metrics-c@example.test','Outside period','2026-02-01Z','sent');
  PERFORM record_outreach_reply(jsonb_build_object('id',v_reply,'lead_id',v_a,'channel','linkedin','replied_at','2026-01-08T00:00:00Z','notes','Manually observed'));
  ASSERT (SELECT status='paused' AND pause_reason='reply' FROM outreach_sequences WHERE id=v_q),'New reply must pause active sequence';
  UPDATE outreach_sequences SET status='active' WHERE id=v_q;
  PERFORM record_outreach_reply(jsonb_build_object('id',v_reply,'lead_id',v_a,'channel','linkedin','replied_at','2026-01-08T00:00:00Z','notes','Manually observed'));
  ASSERT (SELECT status='active' FROM outreach_sequences WHERE id=v_q),'Reply replay must not re-pause resumed sequence';
  ASSERT (SELECT count(*)=1 FROM outreach_replies WHERE id=v_reply),'Reply replay is idempotent';
  PERFORM record_outreach_reply(jsonb_build_object('id',gen_random_uuid(),'lead_id',v_a,'channel','email','replied_at','2026-01-09T00:00:00Z'));
  PERFORM record_outreach_reply(jsonb_build_object('id',gen_random_uuid(),'lead_id',v_b,'channel','email','replied_at','2026-01-04T00:00:00Z'));
  INSERT INTO outreach_sequences(lead_id,start_at) VALUES(v_c,'2026-03-01Z') RETURNING id INTO v_future_q;
  PERFORM record_outreach_reply(jsonb_build_object('id',gen_random_uuid(),'lead_id',v_c,'channel','email','replied_at','2026-02-01T00:00:00Z'));
  ASSERT (SELECT status='active' FROM outreach_sequences WHERE id=v_future_q),'Backfilled reply must not pause a sequence that started later';
  v_record:=record_outreach_meeting(jsonb_build_object('id',v_meeting,'lead_id',v_a,'booked_at','2026-01-10T00:00:00Z','scheduled_at','2026-03-01T09:00:00Z'));
  PERFORM record_outreach_meeting(jsonb_build_object('id',v_meeting,'lead_id',v_a,'booked_at','2026-01-10T00:00:00Z','scheduled_at','2026-03-01T09:00:00Z'));
  ASSERT (SELECT count(*)=1 FROM outreach_meetings WHERE id=v_meeting),'Meeting replay is idempotent';
  BEGIN
    PERFORM record_outreach_meeting(jsonb_build_object('id',gen_random_uuid(),'lead_id',v_a,'scheduled_at','2026-03-01T09:00:00Z'));
    RAISE EXCEPTION 'Duplicate meeting should fail';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  UPDATE outreach_meetings SET scheduled_at='2026-03-02T09:00:00Z',status='completed',outcome='Demo complete' WHERE id=v_meeting;
  v_record:=record_outreach_meeting(jsonb_build_object('id',v_meeting,'lead_id',v_a,'scheduled_at','2026-03-01T09:00:00Z'));
  ASSERT v_record->>'status'='completed' AND v_record->>'outcome'='Demo complete','Retry must preserve meeting edits';
  v_stats:=get_outreach_stats('2026-01-01Z','2026-02-01Z');
  ASSERT v_stats->>'linkedin_sent'='1','Completed LinkedIn step counts as sent';
  ASSERT v_stats->>'response_rate_numerator'='1','Replies before contact, at end boundary, and repeat replies must not inflate numerator';
  ASSERT v_stats->>'response_rate_denominator'='3','Contacts must count unique leads across channels and repeated sends';
  ASSERT (v_stats->>'response_rate')::numeric=33.33,'Response percentage must use numerator/denominator';
  ASSERT v_stats->>'meetings_booked'='1','Bookings use booking time; rescheduling and outcome changes do not add bookings';
  UPDATE outreach_meetings SET status='cancelled' WHERE id=v_meeting;
  ASSERT get_outreach_stats('2026-01-01Z','2026-02-01Z')->>'meetings_booked'='1','Historical booking count includes cancelled bookings';
  ASSERT NOT has_function_privilege('anon','get_outreach_stats(timestamptz,timestamptz)','execute'),'Anonymous RPC access must be denied';
  ASSERT NOT has_function_privilege('authenticated','record_outreach_reply(jsonb)','execute'),'Direct reply mutations must be denied';
  -- Check exact aggregation beyond the default PostgREST row limit.
  INSERT INTO leads(email) SELECT 'bulk-metrics-'||i||'@example.test' FROM generate_series(1,1001) i;
  INSERT INTO email_logs(lead_id,recipient,subject,sent_at,status)
    SELECT id,email,'Bulk metric fixture','2026-01-10Z','sent' FROM leads WHERE email LIKE 'bulk-metrics-%@example.test';
  ASSERT get_outreach_stats('2026-01-01Z','2026-02-01Z')->>'response_rate_denominator'='1004','Aggregation must not truncate at 1000 rows';
  RAISE NOTICE 'Passed Outreach aggregation, deduplication, pause, period, and permission checks';
END $$;
-- Partial installation: unrelated tracked metrics remain available.
ALTER TABLE outreach_sequence_steps RENAME TO outreach_sequence_steps_unavailable;
DO $$ DECLARE v jsonb; BEGIN
  v:=get_outreach_stats('2026-01-01Z','2026-02-01Z');
  ASSERT v->'linkedin_sent'='null'::jsonb AND v->'response_rate'='null'::jsonb AND v->>'meetings_booked'='1','Missing contact tracking yields null without losing meeting count';
END $$;
ALTER TABLE outreach_sequence_steps_unavailable RENAME TO outreach_sequence_steps;
ALTER TABLE outreach_replies RENAME TO outreach_replies_unavailable;
DO $$ DECLARE v jsonb; BEGIN
  v:=get_outreach_stats('2026-01-01Z','2026-02-01Z');
  ASSERT v->'response_rate'='null'::jsonb AND v->>'response_rate_denominator'='1004' AND v->>'linkedin_sent'='1','Missing replies preserve known denominator and LinkedIn count';
  RAISE NOTICE 'Passed partial-schema null-versus-zero checks';
END $$;
ROLLBACK;
