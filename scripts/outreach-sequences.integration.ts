// Run only against a disposable local database named outreach_sequences_test.
// SEQUENCE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55439/outreach_sequences_test bun run scripts/outreach-sequences.integration.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const url = new URL(process.env.SEQUENCE_TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:55439/outreach_sequences_test");
assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/outreach_sequences_test", "Use the disposable local test database only");
const psql = process.env.PSQL_BIN ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin/psql.exe" : "psql");
const sql = {
  async unsafe(query: string, values: unknown[] = []) {
    const statement = query.replace(/\$(\d+)\b/g, (_, index) => {
      const value = values[Number(index) - 1];
      return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
    });
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(psql, [url.toString(), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], { windowsHide: true });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stderr.on("data", chunk => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
      child.stdin.end(statement);
    });
    let value: any = output || null;
    try { value = JSON.parse(output); } catch { if (output === "t" || output === "f") value = output === "t"; }
    return [{ value }];
  },
  async close() {},
};
let checks = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const scalar = async (query: string, values: unknown[] = []) => (await sql.unsafe(query, values))[0]?.value;
try {
  await sql.unsafe(`
    DROP TABLE IF EXISTS outreach_sequence_attempts,outreach_sequence_steps,outreach_sequences,email_logs,leads,campaigns CASCADE;
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$;
    CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL,archived boolean NOT NULL DEFAULT false,status text DEFAULT 'new',lead_status text);
    CREATE TABLE campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE email_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),resend_email_id text UNIQUE,lead_id uuid REFERENCES leads(id),campaign_id uuid REFERENCES campaigns(id),
      recipient text NOT NULL,subject text NOT NULL,channel text DEFAULT 'email',template text,status text DEFAULT 'queued',sent_at timestamptz,
      delivered_at timestamptz,opened_at timestamptz,clicked_at timestamptz,bounced_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
  `);
  const migration = await readFile(new URL("./outreach-sequences-migration.sql", import.meta.url), "utf8");
  await sql.unsafe(migration);
  await sql.unsafe(migration); // Rerunnable migration.
  const lead = await scalar("INSERT INTO leads(email) VALUES ('sequence@example.test') RETURNING id AS value");
  const steps = ["linkedin", "email", "email", "phone"].map((channel, index) => ({ position: index + 1, channel,
    due_at: new Date(Date.now() + (index < 2 ? -60000 : 86400000)).toISOString(), message: `Touch ${index + 1}`, subject: channel === "email" ? `Subject ${index + 1}` : null }));
  const start = () => scalar("SELECT start_outreach_sequence($1,now(),$2::text::jsonb) AS value", [lead, JSON.stringify(steps)]);
  const claim = () => scalar("SELECT claim_outreach_email('Sender <sender@example.test>') AS value");
  const change = (sequence: string, action: string, input = {}, step: string | null = null) => sql.unsafe("SELECT change_outreach_sequence($1,$2,$3::text::jsonb,$4)", [sequence, action, JSON.stringify(input), step]);
  const finish = (job: any, id: string | null, error: string | null = null) => sql.unsafe("SELECT finish_outreach_email($1,$2,$3,$4)", [job.id, job.lease_token, id, error]);
  const status = (id: string) => scalar("SELECT status AS value FROM outreach_sequence_steps WHERE id=$1", [id]);
  const sequence = await start();
  check(await scalar("SELECT count(*)::int AS value FROM outreach_sequence_steps WHERE sequence_id=$1", [sequence]) === 4, "Four persistent steps");
  await assert.rejects(start(), /duplicate key/); checks++;
  const manual = await scalar("SELECT id AS value FROM outreach_sequence_steps WHERE sequence_id=$1 AND position=1", [sequence]);
  await change(sequence, "complete", { notes: "LinkedIn sent manually", completed_at: new Date(Date.now() - 10000).toISOString() }, manual);
  check(await status(manual) === "completed", "Manual step completed");
  check(await scalar("SELECT notes AS value FROM outreach_sequence_steps WHERE id=$1", [manual]) === "LinkedIn sent manually", "Activity notes persisted");
  const scheduled = await scalar("SELECT id AS value FROM outreach_sequence_steps WHERE sequence_id=$1 AND position=2", [sequence]);
  await assert.rejects(change(sequence, "complete", {}, scheduled), /scheduler/); checks++;
  await change(sequence, "edit", { message: "Edited before sending" }, scheduled);
  await change(sequence, "pause", { reason: "reply" });
  check(await claim() === null, "Reply pause prevents claiming");
  await change(sequence, "resume");
  const jobs = await Promise.all([claim(), claim()]);
  check(jobs.filter(Boolean).length === 1, "Concurrent workers only claim due email once");
  const first = jobs.find(Boolean);
  check(first.payload.html === "Edited before sending", "Claim uses edited content");
  await assert.rejects(change(sequence, "skip", {}, first.id), /delivery in progress/); checks++;
  await sql.unsafe("UPDATE outreach_sequence_steps SET lease_until=now()-interval '1 minute' WHERE id=$1", [first.id]);
  await sql.unsafe("UPDATE leads SET email='changed@example.test' WHERE id=$1", [lead]);
  const recovered = await claim();
  check(recovered.id === first.id && recovered.idempotency_key === first.idempotency_key && recovered.payload.to === first.payload.to, "Recovery freezes payload and idempotency key");
  await finish(first, "stale-provider-id");
  check(await status(first.id) === "scheduled", "Stale worker cannot finalize newer lease");
  check(await scalar("SELECT status AS value FROM outreach_sequence_attempts WHERE lease_token=$1", [first.lease_token]) === "unknown", "Expired attempt is auditable");
  await finish(recovered, null, "Temporary provider failure");
  check(await claim() === null, "Retry respects backoff");
  await sql.unsafe("UPDATE outreach_sequence_steps SET next_attempt_at=now()-interval '1 second' WHERE id=$1", [first.id]);
  const retried = await claim();
  await finish(retried, "provider-success-1");
  await finish(retried, "provider-success-1");
  check(await scalar("SELECT count(*)::int AS value FROM email_logs") === 1, "Finalization is idempotent and creates one log");
  check(await scalar("SELECT e.resend_email_id AS value FROM outreach_sequence_steps s JOIN email_logs e ON s.email_log_id=e.id WHERE s.id=$1", [first.id]) === "provider-success-1", "Sent email is linked");
  await sql.unsafe("UPDATE email_logs SET status='bounced' WHERE resend_email_id='provider-success-1'");
  check(await status(first.id) === "failed", "Provider failure updates step status");
  await change(sequence, "cancel");
  check(await claim() === null, "Cancellation prevents future sends");
  check(await status(manual) === "completed", "Cancellation retains completed activity");

  const archivedSequence = await start();
  await sql.unsafe("UPDATE leads SET archived=true WHERE id=$1", [lead]);
  check(await scalar("SELECT status AS value FROM outreach_sequences WHERE id=$1", [archivedSequence]) === "cancelled", "Archival cancels automatically");
  await assert.rejects(start(), /archived or closed/); checks++;
  await sql.unsafe("UPDATE leads SET archived=false WHERE id=$1", [lead]);
  const outcomeSequence = await start();
  await sql.unsafe("UPDATE leads SET status='won' WHERE id=$1", [lead]);
  check(await scalar("SELECT pause_reason AS value FROM outreach_sequences WHERE id=$1", [outcomeSequence]) === "deal_outcome", "Deal outcome pauses automatically");
  await assert.rejects(change(outcomeSequence, "resume"), /closed lead/); checks++;
  await change(outcomeSequence, "cancel");
  await sql.unsafe("UPDATE leads SET status='new' WHERE id=$1", [lead]);

  const uncertainSequence = await start();
  const uncertain = await claim();
  await sql.unsafe("UPDATE outreach_sequence_steps SET lease_until=now()-interval '1 minute',first_attempt_at=now()-interval '24 hours' WHERE id=$1", [uncertain.id]);
  check(await claim() === null && await status(uncertain.id) === "failed", "Expired deduplication window never resends");
  await change(uncertainSequence, "cancel");
  const inFlightSequence = await start();
  const inFlight = await claim();
  await change(inFlightSequence, "cancel");
  await finish(inFlight, "accepted-before-cancellation");
  check(await status(inFlight.id) === "sent", "Accepted in-flight email is recorded after cancellation");
  check(await claim() === null, "Other steps stay cancelled");
  const exhaustedSequence = await start();
  let exhausted: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    exhausted = await claim();
    await finish(exhausted, null, "Provider unavailable");
    if (attempt < 4) await sql.unsafe("UPDATE outreach_sequence_steps SET next_attempt_at=now()-interval '1 second' WHERE id=$1", [exhausted.id]);
  }
  check(await status(exhausted.id) === "failed", "Five failed attempts stop retries");
  check(await scalar("SELECT next_attempt_at AS value FROM outreach_sequence_steps WHERE id=$1", [exhausted.id]) === null, "Exhausted failures have no next retry");
  check(await claim() === null, "No sixth attempt");
  await change(exhaustedSequence, "cancel");
  check(await status(exhausted.id) === "failed", "Cancellation preserves recorded failures");
  const completedSequence = await start();
  const completeSteps = await scalar("SELECT jsonb_agg(id ORDER BY position) AS value FROM outreach_sequence_steps WHERE sequence_id=$1", [completedSequence]);
  await assert.rejects(change(completedSequence, "skip", {}, manual), /not found/); checks++;
  for (const step of completeSteps) await change(completedSequence, "skip", {}, step);
  check(await scalar("SELECT status AS value FROM outreach_sequences WHERE id=$1", [completedSequence]) === "completed", "All finished steps complete the sequence");
  check(!await scalar("SELECT has_function_privilege('anon','claim_outreach_email(text)','execute') AS value"), "Anonymous users cannot run scheduler RPC");
  check(!await scalar("SELECT has_function_privilege('authenticated','change_outreach_sequence(uuid,text,jsonb,uuid)','execute') AS value"), "Direct authenticated RPC mutation is restricted");
  console.log(`Passed ${checks} PostgreSQL sequence checks.`);
} finally {
  await sql.close();
}
