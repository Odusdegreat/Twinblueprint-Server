# Linked bid details

## Leads CSV import

`POST /api/leads/import` accepts optional `bid_value` and `suppliers` columns.
Use plain numbers (including `0`) for `bid_value`, or the literal `null` to
clear an unconfirmed amount. Use semicolon-separated supplier names, or a
JSON string array escaped as a CSV cell. Use `[]` to clear suppliers.
Blank or omitted cells preserve existing bid details. With both fields blank,
the import does not create or update a bid.

Existing bids are matched by the imported lead's ID, not company or project
name. Only supplied amount/suppliers are updated. For a new bid, include
`bid_phase` and `bid_deadline`; project/client come from the saved lead's
`project`/`company`, or explicit `bid_project`/`bid_client` columns. Required
metadata is never fabricated. New bids default to null amount and [] suppliers
when the respective field is omitted. Lead status is changed only by the CSV's
explicit `status` field; bid import never advances it to proposal.

The response includes `bids_created`, `bids_updated`, and `bids_failed`.
Deadlines must be real calendar dates in `YYYY-MM-DD` format; slash-formatted
dates are rejected rather than interpreted using an assumed locale. Invalid
creation metadata reports the specific CSV field and its validation error.
Lead and bid saves are separate: if the lead saves but its bid fails (including
missing metadata), the lead remains saved and `errors` identifies the row with
`Lead saved, but bid details failed: ...`. The frontend must display these errors
even on HTTP 200. Partial imports return `success: false`, `partial_success: true`,
top-level `errors` (also retained in `data.errors`), and a message containing the
first row error. Full success returns `success: true`, `partial_success: false`.
Imports saving no leads return 400/409 and `partial_success: false`. HTTP 200
for partial saves indicates that some writes completed; do not treat the
request as rolled back. Correct the CSV and reimport to retry the linked bid.

See `leads-with-bids.example.csv` for fictional sample data. Lead CSV export
includes `bid_value`, `suppliers`, `bid_phase`, `bid_deadline`, `bid_project`,
and `bid_client`, matched by lead ID regardless of bid status. Suppliers use
a JSON array escaped as a CSV cell so punctuation in names is preserved.
Existing bids with unknown details export literal `null` and `[]`; leads
without a bid export blank bid cells. Multiple linked bids export as separate
rows with repeated lead fields and a `bid_id` column identifying each bid.
`bid_id` is informational in the export; the importer still matches by lead ID
and rejects ambiguous multiple-bid links. Resolve those links before reimporting
bid changes. Export does not delete or reassign existing bids.

Apply `linked-bid-migration.sql` after `crm-migration.sql` before deploying.
It enforces one bid per non-null lead ID under concurrent writes. If existing
duplicates prevent index creation, resolve them explicitly; the migration does
not delete or reassign records.

Both write endpoints require an authenticated admin.

- `POST /api/bids`: required fields are `project`, `client`, `phase`, and
  `deadline` (date). Also supply `lead_id` (lead UUID) to link the bid.
  `phase` is `Discovery`, `RFP Review`, `Technical Eval`, or `Shortlist`.
  Optional `value` is a JSON number or null (defaults to null); `suppliers`
  is an array of names (defaults to []). `status` defaults to `Active`.
- `PATCH /api/bids/:id`: send at least one field. For the card editor, send
  `{ "value": null, "suppliers": [] }` or confirmed numeric amount and names.
  `0` is valid. Omitted fields, including `lead_id`, are preserved.

Success returns `{ "success": true, "data": { "bid": { ... } } }`, with HTTP
201 for create and 200 for update. A duplicate create/relink returns 409;
fetch the pipeline and edit the existing bid instead of retrying creation.

Neither endpoint changes the lead's status or project size. Do not use
`POST /api/leads/:id/move-to-pipeline` for this editor: that action explicitly
advances the lead to proposal.

After saving, refresh `GET /api/pipeline`. Match the lead's UUID to `lead_id`
inside its stage's `bids` array. Stage membership follows lead status even
when a bid is no longer Active. Unknown amounts stay null and are never
derived from `lead.project_size`.

When no bid exists, the create form must collect the required bid metadata
as well as optional amount and suppliers; do not fabricate a deadline or phase.
