import { expect, mock, test } from "bun:test";
const tables: Record<string, any[]> = {
  bid_suppliers: [{ supplier_id: "s1", bid_id: "b1" }, { supplier_id: "s2", bid_id: "b1" }, { supplier_id: "s1", bid_id: "b2" }],
  bids: [{ id: "b1", lead_id: "l1", status: "Active", value: 0, client: "Client", project: "Bid" }, { id: "b2", lead_id: "l2", status: "Closed", value: 100 }],
  leads: [{ id: "l1", region: "Africa" }, { id: "l2", region: "Africa" }],
  projects: [
    { id: "p1", bid_id: "b1", project: "First", client: "Client", status: "Active" },
    { id: "p2", bid_id: "b1", project: "Second", status: "Completed" },
    { id: "p3", bid_id: "b2", project: "Third", status: "In-flight" },
    { id: "p4", bid_id: "b2", status: "On Hold" },
  ],
  suppliers: [{ id: "s1", name: "One", role: null }, { id: "s2", name: "Two", role: "Architect" }],
};
mock.module("../src/config/supabase.ts", () => ({ supabase: { from(table: string) {
  let rows = tables[table] ?? [];
  const q: any = { select: () => q, in: (key: string, ids: string[]) => { rows = rows.filter(row => ids.includes(row[key])); return q; }, order: () => q,
    range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }),
  }; return q;
} } }));
const { enrichSuppliers } = await import("../src/services/supplier-intelligence.service.ts");
test("counts active projects and distinct shared projects using bid IDs", async () => {
  const [row]: any = await enrichSuppliers([{ id: "s1", name: "One", opportunity: null } as any], true);
  expect(row.active_project_count).toBe(2);
  expect(row.regions).toEqual(["Africa"]);
  expect(row.active_projects.map((p: any) => p.id)).toEqual(["p1", "p3"]);
  expect(row.active_projects[0].value).toBeNull();
  expect(row.active_projects[0].currency).toBeNull();
  expect(row.related_suppliers).toEqual([{ id: "s2", name: "Two", role: "Architect", shared_project_count: 2 }]);
  expect(row.opportunities).toEqual([{ id: "b1", name: "Client", project: "Bid", value: 0, currency: null, insight: null }]);
});
test("unlinked suppliers have zero counts and empty arrays", async () => {
  const [row]: any = await enrichSuppliers([{ id: "unlinked", name: "One" } as any], true);
  expect(row).toMatchObject({ active_project_count: 0, regions: [], active_projects: [], related_suppliers: [], opportunities: [] });
  expect(await enrichSuppliers([])).toEqual([]);
});
test("list summaries omit detail arrays and relationship paging includes every project", async () => {
  const original = tables.projects;
  tables.projects = Array.from({ length: 501 }, (_, i) => ({ id: String(i), bid_id: "b1", status: "Active" }));
  try {
    const [row]: any = await enrichSuppliers([{ id: "s1" } as any]);
    expect(row.active_project_count).toBe(501);
    expect(row.active_projects).toBeUndefined();
  } finally { tables.projects = original!; }
});
