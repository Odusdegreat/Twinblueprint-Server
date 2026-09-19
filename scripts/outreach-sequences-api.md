# Persistent Outreach sequences

Apply `scripts/outreach-sequences-migration.sql` after the existing full and CRM migrations, then deploy the backend with `OUTREACH_SCHEDULER_ENABLED=true`. At least one long-running backend process must stay running; every enabled instance can run the worker safely. Database jobs survive restarts and overdue emails are processed on recovery. The worker polls every 15 seconds and requires the existing `RESEND_API_KEY` and `FROM_EMAIL`. No new hosted queue is needed. The flag defaults off until the migration is installed.

All routes use existing authentication. Reads allow authenticated users; writes require `admin`, matching immediate Outreach sends. Responses use `{ "success": true, "data": ... }`. Invalid input returns 400, missing records 404, and conflicting state or an existing active/paused sequence for the lead returns 409.

A missing or incomplete sequence schema returns 503 with migration instructions. If Supabase reports `PGRST205` for `public.outreach_sequences`, run `scripts/outreach-sequences-migration.sql` in the SQL Editor for the project configured by `SUPABASE_URL`. The migration ends with `NOTIFY pgrst, 'reload schema';`. If the migration was already applied successfully, run that notification again to refresh the schema cache. An installed table with no sequences returns 200 with an empty list; a database setup failure is not treated as an empty list.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/outreach/sequences` | Start and return the four-step sequence |
| GET | `/api/outreach/sequences?lead_id={uuid}&page=1&limit=20` | Lead sequence history and pagination |
| GET | `/api/outreach/sequences/{sequenceId}` | Sequence with ordered steps, attempts, and sent-email records |
| PATCH | `/api/outreach/sequences/{sequenceId}/steps/{stepId}` | Edit message/subject or reschedule an unattempted step |
| POST | `/api/outreach/sequences/{sequenceId}/steps/{stepId}/complete` | Record manual LinkedIn or phone activity |
| POST | `/api/outreach/sequences/{sequenceId}/steps/{stepId}/skip` | Skip an unfinished step |
| POST | `/api/outreach/sequences/{sequenceId}/pause` | Pause, including after a reply or outcome |
| POST | `/api/outreach/sequences/{sequenceId}/resume` | Resume using existing due dates |
| POST | `/api/outreach/sequences/{sequenceId}/cancel` | Cancel and skip future steps |

Start request:

```json
{
  "lead_id": "f88351d0-fecb-4d88-94d9-99a6fa9fe21b",
  "start_at": "2026-10-01T09:00:00+01:00",
  "steps": [
    { "channel": "linkedin", "message": "Hi {{full_name}}, I'd like to connect." },
    { "channel": "email", "subject": "Your project at {{company}}", "message": "<p>Hi {{full_name}}, ...</p>" },
    { "channel": "email", "subject": "Following up", "message": "<p>Following up on {{project}} ...</p>" },
    { "channel": "phone", "message": "Call about the project and record the outcome." }
  ]
}
```

`start_at` is optional (defaults to now). Dates require a timezone offset or `Z`; storage is UTC. Due times are start + 0, 3, 7, and 14 elapsed days. The final channel can be `phone` or `email`; email always requires `subject`. `message` is HTML for email and activity text for manual channels. Existing `{{full_name}}`, `{{company}}`, and `{{project}}` placeholders are rendered at creation. The UI supplies its stage-personalized copy. Edits save final copy verbatim. Empty messages, extra steps, and other channel arrangements are rejected.

Edit body: `{ "due_at": "2026-10-05T08:00:00Z", "subject": "Updated subject", "message": "<p>Updated copy</p>" }` (at least one field).

Manual completion body: `{ "completed_at": "2026-10-01T08:15:00Z", "notes": "Connected on LinkedIn" }`. Fields are optional; completion defaults to now and cannot be in the future. Email steps cannot be manually marked complete. LinkedIn sending remains manual.

Pause body: `{ "reason": "reply", "notes": "Lead replied; follow up personally" }`. Reasons are `manual`, `reply`, or `deal_outcome`. Resume/cancel accept the same optional notes; skip accepts optional notes. Empty bodies are accepted for controls and completion.

The backend has no automatic inbound-reply detection. Use `POST /api/outreach/replies` to record manual replies and pause the applicable active sequence; see [reply tracking and stats](outreach-stats-api.md). The pause endpoint remains available for controls but does not itself record a reply. Changing a lead to `won`, `lost`, or `lead_status: "Closed"` automatically pauses its live sequence. Archiving the lead automatically cancels it. Reopening or unarchiving a lead does not restart contact automatically; resume is explicit and closed/archived leads cannot resume. Other deal systems can call pause with `reason: "deal_outcome"`.

Sequence status is `active`, `paused`, `cancelled`, or `completed`. Each detail response includes `steps`, ordered by `position`, containing `due_at`, `channel`, `message`, `subject`, `status`, `completed_at`, `notes`, `email_log_id`, `sent_email` (existing email-log record or null), `attempt_count`, `attempts`, `next_attempt_at`, `last_error`, and lease/payload metadata. Attempt records contain start/finish times, status, error, and provider ID.

| Step status | UI label | Meaning |
| --- | --- | --- |
| `pending` | Pending | Manual LinkedIn/phone activity remains |
| `scheduled` | Scheduled | Email queued, retry waiting, or being dispatched; sequence state may suspend it |
| `sent` | Sent | Resend accepted it; `sent_email` contains delivery/open/click details |
| `completed` | Completed | Manual activity completed with time and notes |
| `failed` | Failed | Retry exhausted, delivery uncertain, or provider reported failure/bounce |
| `skipped` | Skipped | Explicitly skipped or cancelled before dispatch |

Retries retain a frozen sender, recipient, subject, HTML, and provider idempotency key. Claims use database row locks and five-minute leases; retries use 1/2/4/8-minute backoff, at most five attempts, and a 23-hour safety cutoff. [Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). If an interrupted send cannot be reconciled within the cutoff, the step fails for operator review rather than risking another email. Attempted email payloads cannot be edited or rescheduled. Failed/bounced provider events update the step through the existing verified webhook and do not trigger another send.

Cancel/pause takes effect for future claims. An email already claimed for dispatch may still be accepted; its result is retained even after cancellation. An expired in-flight job is not resent while paused/cancelled and is flagged as uncertain. Completing a manual step is not a prerequisite for a later scheduled email. Resume retains due dates, so overdue steps can send immediately. Scheduling therefore depends on the caller choosing appropriate dates and controls.

Validation performed locally:

```sh
bunx tsc --noEmit
bun test scripts/outreach-sequences.test.ts
bun test scripts/outreach-sequences.routes.test.ts
bun test scripts/outreach-sequences-errors.test.ts
# Disposable local PostgreSQL database only; creates representative CRM tables.
# Set PSQL_BIN when psql is not on PATH (Windows default is PostgreSQL 18).
bun run scripts/outreach-sequences.integration.ts
```

The integration script defaults to `postgres://postgres@127.0.0.1:55439/outreach_sequences_test`; `SEQUENCE_TEST_DATABASE_URL` may select a different local port/user but must retain the test database name. It rebuilds only that test database's fixture tables. No tests send real email. Deal Flow and immediate preview/send retain their existing endpoints.
