# Outreach cards, replies, and meetings

Apply `scripts/outreach-activity-migration.sql` after the CRM and sequence migrations. Existing authentication applies: reads allow authenticated users; writes require admin. Responses use `{ "success": true, "data": ... }`.

## Shared reporting period

`GET /api/outreach/stats?start=2026-08-01T00:00:00Z&end=2026-09-01T00:00:00Z`

Supply both timestamps with timezone offsets or `Z`, or omit both for the trailing 30 elapsed days. All cards use the returned UTC period, start inclusive and end exclusive. Invalid or non-increasing bounds return 400.

Example `data` (illustrative values, not deployment confirmation):

```json
{
  "linkedin_sent": 12,
  "response_rate": 25,
  "response_rate_numerator": 5,
  "response_rate_denominator": 20,
  "meetings_booked": 3,
  "availability": { "linkedin_sent": true, "response_rate": true, "meetings_booked": true },
  "period": { "start": "2026-08-01T00:00:00.000Z", "end": "2026-09-01T00:00:00.000Z", "timezone": "UTC", "bounds": "rolling" },
  "sequence_schema_ready": true,
  "scheduler_enabled": true,
  "unavailable_reason": null
}
```

| Field | Definition |
| --- | --- |
| `linkedin_sent` | Completed LinkedIn sequence steps with `completed_at` in the period. **Completed LinkedIn steps count as sent.** Pending/skipped steps and standalone LinkedIn messages outside sequences do not count. |
| `response_rate_denominator` | Distinct leads contacted in the period: email logs with `sent_at` and status other than failed/bounced, or completed LinkedIn/phone steps. Multiple touches/channels count each lead once. Sequence emails use their existing email logs. |
| `response_rate_numerator` | Distinct leads from that denominator with a recorded reply in the same period, at or after their earliest contact in the period. Multiple replies count once. Replies to contacts occurring only before this period are outside this cohort. |
| `response_rate` | `100 * numerator / denominator`, rounded to two decimals. Returns 0 if tracking is installed and the denominator is 0. |
| `meetings_booked` | Stored meeting IDs whose original `booked_at` falls in the period, regardless of scheduled date. Reschedules and outcome changes preserve the ID and booking time. This historical count includes meetings later completed, cancelled, or marked no-show. |

Aggregation happens in PostgreSQL, without REST row-limit truncation. Known delivery failures/bounces can revise the denominator. Deleted leads have their activity removed, so historical metrics reflect retained records.

`bounds` is `"rolling"` for the trailing 30 elapsed days; custom windows use the same marker. Unavailable metrics return `null`; tracked metrics without records return `0`. `availability` identifies tracked metrics. `unavailable_reason` is `null` when all metrics are computed and becomes a migration-guidance phrase when any metric cannot be computed (e.g. missing sequence or reply tracking). Missing reply tracking leaves rate/numerator null while preserving a known denominator. Missing sequence/contact tracking leaves response rate null rather than showing a partial denominator. If the stats function is not deployed, all metrics are null with `unavailable_reason` explaining the migration requirement. Permission and unexpected database errors return 500, not fabricated zeros.

## Manual replies

`POST /api/outreach/replies`

```json
{
  "id": "13e95b5a-7ba9-4faa-8fc3-0b50fbed8bca",
  "lead_id": "445066af-7f9d-452b-9926-c1f869f23df9",
  "channel": "linkedin",
  "replied_at": "2026-09-13T08:30:00Z",
  "notes": "Interested; asked for a demo"
}
```

Generate `id` once per reply (e.g. `crypto.randomUUID()`) and reuse it on retries. Channels: `linkedin`, `email`, `phone`. `replied_at` defaults to now and cannot be future; notes are optional. `outreach_replies` stores ID, lead, channel, reply time, notes, and creation time. An identical replay returns the existing record; conflicting data with the same ID returns 409.

A new reply atomically pauses the lead's active sequence if it occurred on or after sequence start. Replays do not re-pause a resumed sequence, and historical replies predating a new sequence do not pause it. Detection remains manual. Legacy pause actions are not inferred to be replies; using the pause endpoint alone does not increment metrics.

`GET /api/outreach/replies?lead_id={uuid}&page=1&limit=20` returns `{ replies, pagination }` in `data`.

## Meetings

`POST /api/outreach/meetings`

```json
{
  "id": "85b29a4f-bbdc-4585-ac23-a7de4cae4da9",
  "lead_id": "445066af-7f9d-452b-9926-c1f869f23df9",
  "booked_at": "2026-09-13T08:35:00Z",
  "scheduled_at": "2026-09-17T09:00:00+01:00",
  "notes": "Product demo"
}
```

Generate one stable ID per meeting and reuse it on retries. `booked_at` defaults to now and cannot be future; `scheduled_at` is required. Storage is `outreach_meetings`, initially status `booked`. Repeated IDs return the current record without overwriting edits. An ID belonging to another lead returns 409. A different ID for the same lead and scheduled instant also returns 409. Existing demo-request lead submissions do not automatically count as meetings.

`PATCH /api/outreach/meetings/{meetingId}` accepts at least one of `scheduled_at`, `status`, `outcome`, or `notes`. Status is `booked`, `completed`, `cancelled`, or `no_show`. Example:

```json
{ "status": "completed", "outcome": "Demo delivered; proposal requested", "notes": "Follow up next week" }
```

Use PATCH with the existing ID to reschedule. ID, lead, and booking time cannot change. Outcome/notes can be cleared with null; a missing meeting returns 404.

`GET /api/outreach/meetings?lead_id={uuid}&page=1&limit=20` returns `{ meetings, pagination }`. List endpoints require `lead_id`; pagination defaults to page 1/limit 20, maximum 100. Recording endpoints return 201, including idempotent replays. Missing activity storage returns 503 for recording/listing/updating.

## Deployment verification

`sequence_schema_ready` checks sequence tables and RPCs. `scheduler_enabled` reports the environment flag on the responding backend instance. Schema readiness is null if the stats function is unavailable. These fields do not establish provider credentials or worker health. A running worker needs the existing Resend configuration and `OUTREACH_SCHEDULER_ENABLED=true` before live sending tests.

Read-only check on 2026-09-13: configured Supabase returned `PGRST205` for all three sequence tables and both activity tables; the local scheduler flag was false. No SQL connection or management token is configured here to apply migrations. Apply the migrations in the configured project's SQL Editor, then enable the scheduler on the deployed worker. The implementation and sample above are not confirmation of live readiness.

Tests: `bun test scripts/outreach-activity.test.ts`, `bunx tsc --noEmit`, and `scripts/outreach-activity.test.sql` on the disposable local sequence test database after applying the activity migration. SQL tests cover deduplication, cohort membership, boundaries, reply pausing, partial-schema nulls, permissions, and over 1,000 contacts.
