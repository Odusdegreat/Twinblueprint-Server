# Manual LinkedIn send: frontend contract

Status: implemented locally; not deployed. Apply CRM, outreach sequence, and outreach activity migrations first, then `scripts/outreach-linkedin-sends-migration.sql`, and deploy the backend. Apply the LinkedIn migration last if rerunning older migrations because it updates the stats function. This feature does not require Resend or the scheduler.

## Record

`POST /api/outreach/linkedin-sends` with `Authorization: Bearer <admin-token>` and `Content-Type: application/json`:

```json
{
  "id": "f88351d0-fecb-4d88-94d9-99a6fa9fe21b",
  "lead_id": "217b801e-3118-4b7c-8f4a-0cda0ef60b94",
  "message": "Hi Sam, here is the information we discussed.",
  "sent_at": "2026-09-21T09:00:00Z"
}
```

Example HTTP 201 response (timestamps and IDs illustrative):

```json
{
  "success": true,
  "data": {
    "id": "f88351d0-fecb-4d88-94d9-99a6fa9fe21b",
    "lead_id": "217b801e-3118-4b7c-8f4a-0cda0ef60b94",
    "message": "Hi Sam, here is the information we discussed.",
    "sent_at": "2026-09-21T09:00:00+00:00",
    "recorded_by": "b33b1651-4aaa-48a7-92f4-7b3f581f04a3",
    "created_at": "2026-09-21T09:01:00+00:00"
  }
}
```

Generate the activity UUID once per actual manual send, retain it across timeouts/retries, and resend the unchanged payload. An identical retry by the same admin returns the original record with HTTP 201. A different payload or authenticated actor for that ID returns 409. A new UUID represents a separate send. The frontend must not also complete a sequence step for this same send: these are independent activities, and the server cannot infer that two separately recorded activities represent the same external message.

`recorded_by` is derived from the verified token and cannot be supplied in the body. Message whitespace, punctuation, newlines, and HTML characters are preserved. No provider request, sequence creation, scheduling, or sequence modification occurs. This is an admin's manual-send assertion, not proof of LinkedIn delivery.

## Retrieve

`GET /api/outreach/linkedin-sends?lead_id=217b801e-3118-4b7c-8f4a-0cda0ef60b94&page=1&limit=20`

Requires authentication, consistent with other activity reads. Response:

```json
{"success":true,"data":{"linkedin_sends":[],"pagination":{"page":1,"limit":20,"total":0,"pages":0}}}
```

For populated results, each array element has the same fields as the POST response's `data`. Records sort by creation time descending, then ID descending. `lead_id` is required; page >= 1; limit 1–100.

## Statistics

`GET /api/outreach/stats` adds each standalone record once to `linkedin_sent`, using `sent_at` with inclusive start/exclusive end. Existing completed LinkedIn sequence steps remain included. Retries cannot add rows. Response-rate contacts include these activities and deduplicate by lead across manual sends, sequence touches, and emails. Repeated replies cannot inflate the numerator. No record is mirrored into sequence steps or email logs.

## Errors

- 400: invalid UUID, missing required field, blank/over-10,000-character message, invalid/future timestamp, or unknown body field (including `recorded_by`).
- 401: missing/invalid/expired authentication.
- 403: non-admin write.
- 404: referenced lead or authenticated user no longer exists.
- 409: activity ID reused with different message, lead, timestamp, or actor.
- 413: request exceeds the application's 10 KB JSON body limit (including UTF-8 and JSON overhead).
- 429: API rate limit exceeded.
- 503: migration/schema unavailable; API returns generic `Service unavailable`, with migration detail in server logs.
- 500: unexpected persistence failure.

Example validation response:

```json
{"error":"VALIDATION_ERROR","message":"Please check the highlighted fields.","fields":[{"path":"sent_at","message":"A valid non-future sent time is required"}]}
```

Example conflict response:

```json
{"success":false,"message":"Activity ID already belongs to a different record"}
```

Display confirmation only after a successful response. Render saved message text as text, not raw HTML.
