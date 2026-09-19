# Supplier GET enrichment

Uses the supplier intelligence tables and the standalone opportunities tables
created by `scripts/supplier-migration.sql`. Apply that migration before using
the opportunity endpoints. Supplier names in legacy arrays are never used as
identity matches. A project without a bid link cannot be attributed.

GET /api/suppliers retains pagination and profile fields, adding
active_project_count and regions per supplier. GET /api/suppliers/:id keeps
data.supplier and also adds active_projects, related_suppliers, opportunities.
Both reads require authentication. Existing supplier create/edit/link routes
remain unchanged. These computed fields are read-only.

- Active projects: status Active or In-flight, case-insensitive. Excludes On Hold,
  Completed and Cancelled. Count equals active_projects.length.
- Shared projects: distinct project IDs across all statuses, connected to both
  suppliers through that project's bid. Excludes the supplier itself. A shared
  bid without a project does not count. Related suppliers sort by count descending.
- Regions: distinct nonblank regions from leads attached to the supplier's linked
  bids, across all statuses. These represent linked deal geography, not a stored
  supplier office/service-area declaration.
- Project value/currency: null because projects do not store these fields. Bid
  amounts are not copied into project values. Status is returned as stored;
  In Progress from the example is not a supported project status.
- Opportunities: standalone opportunity rows linked to the supplier, with
  optional lead, project, and bid IDs. The compact response includes id, name,
  project, nullable value/currency/insight, and status. Legacy active linked
  bids are used only as a read fallback while the opportunities migration is
  unavailable.
- Empty relationships return [], count 0. Unknown values stay null. No seeded
  data is inserted. Relationship queries are paginated to avoid truncated counts.

Pipeline supplier_details remains the existing profile representation; these
additional intelligence arrays belong to the supplier GET endpoints.
