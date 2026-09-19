# Projects and supplier intelligence

Project writes require an authenticated admin. Reads require authentication.

- `POST /api/projects` requires `project`, `client`, `start_date`, `end_date`.
- `PATCH /api/projects/:id` accepts one or more of the same fields and optional
  fields below; omitted fields retain their saved values.
- `GET /api/projects?page=1&limit=20` lists projects with pagination.
- `GET /api/projects/:id` returns one project.

Optional fields: `progress` (0–100, default 0), `suppliers` (array of names,
default []), `uses_3d` (send a JSON boolean, default false), `competitor` and
`issue` (nullable strings), `bid_id` (nullable UUID), and `status`.
Issues are currently a single text field named `issue`, not an issue array.
Use YYYY-MM-DD dates.

Allowed status values are case-sensitive:

| Status | Meaning | In pipeline's inflight_projects |
| --- | --- | --- |
| Active | Open project, default | No |
| In-flight | Execution underway | Yes |
| On Hold | Paused | No |
| Completed | Finished | No |
| Cancelled | Cancelled | No |

POST example (fictional):

```json
{
  "project": "Office Renovation",
  "client": "Example Client",
  "start_date": "2026-09-01",
  "end_date": "2027-03-31",
  "progress": 25,
  "suppliers": ["Supplier A", "Supplier B"],
  "uses_3d": true,
  "competitor": "Example competitor",
  "issue": "Awaiting material delivery",
  "bid_id": null,
  "status": "In-flight"
}
```

POST returns HTTP 201; PATCH returns HTTP 200. Both return
`{"success":true,"message":"Project created successfully","data":{"project":{...}}}`
(PATCH message: `Project updated successfully`). The project contains every
saved field above plus database-generated `id` and `created_at`.

PATCH example:

```json
{"progress":100,"status":"Completed","uses_3d":false,"issue":null}
```

After saving, refetch `GET /api/pipeline`. It queries saved project data on
every request, includes complete In-flight project objects in
`data.inflight_projects`, and counts them in `data.summary.total_projects`.
The PATCH above removes that project from this list; it remains in GET projects.

## Supplier endpoint proposal (not implemented)

No supplier routes or supplier identity model currently exist. Project/bid
`suppliers` arrays contain names only; neither role nor region can be inferred
reliably from a name. Proposed read endpoint:
`GET /api/suppliers?page=1&limit=20&region=Africa&role=Contractor`.

Illustrative response:

```json
{
  "success": true,
  "data": {
    "suppliers": [{
      "id": "9f337466-f020-45f4-a578-f5c06d708dc7",
      "name": "Supplier A",
      "roles": ["Contractor"],
      "regions": ["Africa"],
      "projects": [{"id":"df126a67-907e-4c46-adde-70fdd659dc53","project":"Office Renovation","role":"Contractor"}],
      "bids": []
    }],
    "pagination": {"page":1,"limit":20,"total":1,"pages":1}
  }
}
```

Requires a suppliers table with stable UUIDs and project_suppliers / bid_suppliers
join tables. Roles can be relationship-specific. Unknown roles/regions should
remain empty, not fabricated. Existing names need reviewed identity matching;
do not merge distinct suppliers solely because their display names match.

## Existing records inspected

`1077b1de-3aa9-4f16-94d6-d10f1ab6eb18` is explicitly named
`Pipeline API Test - Inflight`, client `TwinBlueprint Test Client` (In-flight).

Three Active Miami Worldcenter / MDM Group projects match the fixture in
`scripts/smoke-test.ts`: `b585eb05-f716-4515-a3bc-efdda89159c8`,
`9780a00d-2c85-4bfd-a07c-69255cae1e51`,
`6f4f11a8-7f97-47ea-ab3e-c2365d459fb9`. They are suspected fixture records,
but creation provenance is not stored, so their origin cannot be confirmed.

Seven lead records are explicitly test-named: two Discovery test leads,
Qualified, Proposal, Negotiation, Closed Won, and Test Engineering Lead.
Names indicate test intent, not a verified creation audit. No records were
modified or deleted during this inspection.
