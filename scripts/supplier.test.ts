import { expect, mock, test } from "bun:test";
import { supplierSchema, supplierUpdateSchema } from "../src/validations/supplier.validation.ts";
let supplier: any;
let links: any[] = [];
let supplierExists = true;
let lookupError: { code: string } | null = null;
mock.module("../src/config/supabase.ts", () => ({ supabase: { from(table: string) {
  let changes: any;
  let remove = false;
  const q: any = {
    select: () => q, eq: () => q, in: () => q, order: () => q,
    insert: (data: any) => { changes = data; return q; },
    update: (data: any) => { changes = data; return q; },
    single: async () => { supplier = { ...supplier, ...changes }; return { data: supplier, error: null }; },
    maybeSingle: async () => ({ data: table === "bids" ? { id: "bid" } : supplierExists ? supplier : null, error: null }),
    upsert: async (data: any) => { if (!links.length) links.push(data); return { error: null }; },
    delete: () => { remove = true; return q; },
    range: async () => ({ data: links.map(link => ({ ...link, supplier })), error: lookupError }),
    then: (resolve: any, reject: any) => { if (remove) links = []; return Promise.resolve({ error: null }).then(resolve, reject); },
  }; return q;
} } }));
const { enrichBidSuppliers, linkSupplier, saveSupplier } = await import("../src/services/supplier.service.ts");
test("unknown profile values remain unknown, false is valid, patch preserves omitted fields", () => {
  supplier = { id: "supplier", ...supplierSchema.parse({ name: "Actual supplier" }) };
  expect(supplier).toMatchObject({ tools: [], temperature: null, contact: { name: null, job_title: null, email: null }, uses_3d: null, pain_points: [] });
  expect(supplierUpdateSchema.parse({ uses_3d: false })).toEqual({ uses_3d: false });
  expect(supplierUpdateSchema.safeParse({ temperature: "Active" }).success).toBe(false);
  expect(supplierUpdateSchema.safeParse({ contact: { email: "invalid" } }).success).toBe(false);
});
test("linking is idempotent and pipeline details reflect profile edits without losing bid fields", async () => {
  const bid: any = { id: "bid", project: "Project", client: "Client", status: "Active", phase: "Shortlist", deadline: "2026-12-01", value: 0, lead_id: "lead", suppliers: ["Legacy name"] };
  expect((await enrichBidSuppliers([bid]))[0]?.supplier_details).toEqual([]);
  await linkSupplier("bid", "supplier");
  await linkSupplier("bid", "supplier");
  expect(links).toHaveLength(1);
  await saveSupplier({ uses_3d: false, tools: ["Revit"] }, "supplier");
  const [result] = await enrichBidSuppliers([bid]);
  expect(result).toMatchObject({ ...bid, suppliers: ["Legacy name", "Actual supplier"] });
  expect(result?.supplier_details[0]).toMatchObject({ tools: ["Revit"], uses_3d: false, role: null });
  await linkSupplier("bid", "supplier", true);
  expect((await enrichBidSuppliers([bid]))[0]?.supplier_details).toEqual([]);
});
test("missing supplier cannot be linked", async () => {
  supplierExists = false;
  await expect(linkSupplier("bid", "missing")).rejects.toMatchObject({ statusCode: 404 });
});

test("missing supplier schema preserves bids and legacy names", async () => {
  const bid: any = { id: "bid", value: 0, suppliers: ["Existing name"] };
  try {
    for (const code of ["PGRST205", "PGRST200", "42P01"]) {
      lookupError = { code };
      expect(await enrichBidSuppliers([bid])).toEqual([{ ...bid, supplier_details: [] }]);
    }
    lookupError = { code: "42501" };
    await expect(enrichBidSuppliers([bid])).rejects.toMatchObject({ statusCode: 500 });
  } finally { lookupError = null; }
});
