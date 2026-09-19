# Supplier profiles on active bids

Apply `scripts/supplier-migration.sql` before deploying this backend. No sample
profiles are inserted and no legacy supplier names are automatically matched.
If the supplier tables or relationship are not yet available in the schema
cache, pipeline returns the existing bids with supplier_details: [] and logs a
migration warning. Other lookup failures remain errors. Supplier CRUD and linking
still require the migration; this fallback does not create tables or profiles.

Authenticated reads:
- `GET /api/suppliers?page=1&limit=20` returns `data.suppliers` and pagination.
- `GET /api/suppliers/:id` returns `data.supplier`.

Admin writes:
- `POST /api/suppliers` requires only `name`; returns HTTP 201 and `data.supplier`.
- `PATCH /api/suppliers/:id` accepts one or more profile fields; returns HTTP 200
  and `data.supplier`. Omitted top-level fields are preserved. If supplied,
  `contact` replaces the entire contact object; missing contact fields become null.
- `PUT /api/bids/:id/suppliers/:supplierId` links an existing supplier, no body.
  Idempotent: repeated requests do not duplicate links.
- `DELETE /api/bids/:id/suppliers/:supplierId` removes that link, no body.
  Both return `{ "success": true, "message": "...", "data": {} }`.

Example create body (illustrative only): `{"name":"Supplier name"}`.
Response:
```json
{
  "success": true,
  "data": {
    "supplier": {
      "id": "database-generated-uuid",
      "name": "Supplier name",
      "role": null,
      "tools": [],
      "temperature": null,
      "contact": {"name":null,"job_title":null,"email":null},
      "visualisation_tool": null,
      "uses_3d": null,
      "opportunity": null,
      "pain_points": []
    }
  }
}
```

PATCH example: `{"tools":["Revit"],"uses_3d":false,"temperature":"warm"}`.
Temperature accepts hot/warm/cool/null; uses_3d accepts true/false/null. Contact
email must be a valid email or null. Role, visualisation_tool and opportunity
accept strings or null; tools and pain_points accept arrays of strings.

After editing or linking, refetch `GET /api/pipeline`. Each `data.active_bids`
entry preserves id, project, client, status, phase, deadline, value, lead_id,
and other existing fields, and adds `supplier_details` with the profile objects
above. `suppliers` remains a names array: a union of legacy saved names and names
of linked supplier profiles. Unlinked legacy names have no fabricated profile;
if no profiles are linked, `supplier_details` is [].

Unlinking does not erase a name separately stored in the legacy bid suppliers
array. Edit that array through PATCH /api/bids/:id if it also needs removal.
Supplier profiles are shared across bids; editing a profile updates its display
on all linked active bids. CSV imports continue to manage legacy supplier names,
not structured profiles. Regions and project links from the earlier supplier
intelligence proposal are outside this implementation.
