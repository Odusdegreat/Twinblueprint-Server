import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";

process.env.LEAD_ENRICHMENT_DISABLED = "1";

let insertError: { code: string; message: string } | null;
let existing: { id: string } | null;
let inserted: any;
mock.module("../src/config/supabase.ts", () => ({ supabase: {
  from() {
    let writing = false;
    const query = {
      select: () => query, eq: () => query,
      insert: (value: unknown) => { writing = true; inserted = value; return query; },
      single: async () => writing ? { data: insertError ? null : { id: "new-lead", ...inserted }, error: insertError } : { data: existing, error: null },
    };
    return query;
  },
} }));
const { createDemoService } = await import("../src/services/demo.service.ts");
const log = spyOn(console, "error").mockImplementation(() => {});
afterAll(() => log.mockRestore());
beforeEach(() => { insertError = null; existing = null; inserted = undefined; });
const input = { fullName: "Demo test", workEmail: "demo@example.test", industry: "Construction" };

test("demo persists industry and returns the created lead", async () => {
  const lead = await createDemoService(input);
  expect(inserted.industry).toBe("Construction");
  expect(inserted.category).toBeUndefined();
  expect(lead.id).toBe("new-lead");
});
test("missing industry column gives precise repair instructions", async () => {
  for (const code of ["PGRST204", "42703"]) {
    insertError = { code, message: "Could not find the industry column of leads" };
    await expect(createDemoService(input)).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining("leads-industry-migration.sql") });
  }
});
test("other database errors are not misdiagnosed as an industry migration", async () => {
  insertError = { code: "PGRST204", message: "Missing other column" };
  await expect(createDemoService(input)).rejects.toMatchObject({ statusCode: 500 });
});
test("duplicate lead rejection is preserved", async () => {
  existing = { id: "existing-lead" };
  await expect(createDemoService(input)).rejects.toMatchObject({ statusCode: 409 });
  expect(inserted).toBeUndefined();
});
