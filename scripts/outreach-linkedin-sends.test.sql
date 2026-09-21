-- Disposable local fixture only; all test rows roll back.
BEGIN;
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); u bigint:=1; l uuid; q uuid;
  payload jsonb; saved jsonb; stats jsonb; before_sequences bigint; before_steps bigint;
BEGIN
  IF current_database()<>'outreach_sequences_test' THEN RAISE EXCEPTION 'Disposable test database required'; END IF;
  INSERT INTO users(id) VALUES(u);
  INSERT INTO leads(email) VALUES('manual@example.test') RETURNING id INTO l;
  SELECT count(*) INTO before_sequences FROM outreach_sequences;
  SELECT count(*) INTO before_steps FROM outreach_sequence_steps;
  payload:=jsonb_build_object('id',a,'lead_id',l,'message',E'  Hi <Sam> & "team"!\nExact text.  ','sent_at','2026-01-05T12:00:00Z','recorded_by',u);
  saved:=record_outreach_linkedin_send(payload);
  ASSERT saved->>'message'=payload->>'message','Exact message preserved';
  ASSERT saved->>'recorded_by'=u::text,'Actor retained';
  ASSERT record_outreach_linkedin_send(payload)=saved,'Retry returns original record';
  ASSERT (SELECT count(*)=1 FROM outreach_linkedin_sends WHERE id=a),'One record after retry';
  ASSERT (SELECT count(*)=before_sequences FROM outreach_sequences),'No sequence created';
  ASSERT (SELECT count(*)=before_steps FROM outreach_sequence_steps),'No steps scheduled';
  BEGIN
    PERFORM record_outreach_linkedin_send(payload||'{"message":"changed"}'::jsonb);
    RAISE EXCEPTION 'Expected conflict';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM record_outreach_linkedin_send(payload||jsonb_build_object('id',b,'lead_id',gen_random_uuid()));
    RAISE EXCEPTION 'Expected missing lead';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    PERFORM record_outreach_linkedin_send(payload||jsonb_build_object('id',b,'sent_at',now()+interval '1 day'));
    RAISE EXCEPTION 'Expected future time rejection';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  stats:=get_outreach_stats('2026-01-01Z','2026-02-01Z');
  ASSERT stats->>'linkedin_sent'='1','Retry counted once';
  ASSERT stats->>'response_rate_denominator'='1','Manual contact included';
  INSERT INTO outreach_sequences(lead_id,start_at) VALUES(l,'2026-01-01Z') RETURNING id INTO q;
  INSERT INTO outreach_sequence_steps(sequence_id,position,channel,message,due_at,status,completed_at)
    VALUES(q,1,'linkedin','Separate sequence touch','2026-01-06Z','completed','2026-01-06Z');
  PERFORM record_outreach_reply(jsonb_build_object('id',b,'lead_id',l,'channel','linkedin','replied_at','2026-01-07T00:00:00Z'));
  stats:=get_outreach_stats('2026-01-01Z','2026-02-01Z');
  ASSERT stats->>'linkedin_sent'='2','Separate sends count individually';
  ASSERT stats->>'response_rate_denominator'='1','Same lead counted once across sources';
  ASSERT stats->>'response_rate_numerator'='1' AND (stats->>'response_rate')::numeric=100,'Manual reply counted once';
  stats:=get_outreach_stats('2026-01-01Z','2026-01-05T12:00:00Z');
  ASSERT stats->>'linkedin_sent'='0','End boundary excluded';
  ASSERT NOT has_function_privilege('anon','record_outreach_linkedin_send(jsonb)','execute'),'Anonymous RPC denied';
  ASSERT NOT has_function_privilege('authenticated','record_outreach_linkedin_send(jsonb)','execute'),'Direct authenticated RPC denied';
  ASSERT NOT has_table_privilege('authenticated','outreach_linkedin_sends','select'),'Direct table access denied';
END $$;
ROLLBACK;
