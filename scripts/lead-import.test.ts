import { expect, test, mock } from "bun:test";

let existing = false;
let insertCode: string | undefined;
let inserts = 0;
let updates: Record<string, unknown> = {};
let bidUpdates: Record<string, unknown> = {};
let bidError = false;
mock.module("../src/config/supabase.ts", () => ({
  supabase: {
    from: (table: string) => table === "bids" ? {
      select: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: "bid" }], error: null }) }) }),
      update: (value: Record<string, unknown>) => { bidUpdates = value; return { eq: () => ({ select: () => ({ single: async () => ({ data: bidError ? null : { id: "bid" }, error: bidError ? { code: "XX000" } : null }) }) }) }; },
    } : ({
      select: () => ({ ilike: () => ({ limit: async () => ({ data: existing ? [{ id: "existing" }] : [], error: null }), single: async () => ({ data: { id: "existing" }, error: null }) }) }),
      insert: async () => { inserts++; if (insertCode) existing = true; return { error: insertCode ? { code: insertCode, message: "database constraint" } : null }; },
      update: (value: Record<string, unknown>) => { updates = value; return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "existing" }, error: null }) }) }) }; },
    }),
  },
}));
mock.module("../src/services/email.service.ts", () => ({ emailService: {} }));
mock.module("../src/config/env.config.ts", () => ({ env: {} }));
const service = await import("../src/services/lead.service.ts");
const controller = await import("../src/controllers/lead.controller.ts");

test("existing email updates status with a successful frontend response and preserves omitted fields", async () => {
  existing = true;
  inserts = 0;
  let status: number | undefined;
  let body: any;
  const res = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; } };
  await controller.importLeads({ file: { buffer: Buffer.from("full_name,email,status,company\nJane Doe,JANE@example.com,won,") } } as any, res as any);
  expect(status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.message).toContain("Updated 1 lead(s)");
  expect(body.data.updated).toBe(1);
  expect(updates).toEqual({ full_name: "Jane Doe", status: "won" });
  expect(inserts).toBe(0);
});

test("same email in one CSV is skipped regardless of company", async () => {
  existing = false;
  insertCode = undefined;
  inserts = 0;
  const result = await service.importLeads(Buffer.from("full_name,email,company\nJane Doe,jane@example.com,One\nJane Doe,JANE@example.com,Two"));
  expect(result.created).toBe(1);
  expect(result.skipped).toBe(1);
  expect(result.errors[0]?.row).toBe(3);
  expect(inserts).toBe(1);
});

test("database duplicate race updates the concurrently created lead", async () => {
  existing = false;
  insertCode = "23505";
  const result = await service.importLeads(Buffer.from("full_name,email\nJane Doe,jane@example.com"));
  expect(result.updated).toBe(1);
  expect(result.failed).toBe(0);
  expect(result.errors).toEqual([]);
});

test("invalid status does not modify an existing lead", async () => {
  existing = true;
  updates = {};
  const result = await service.importLeads(Buffer.from("full_name,email,status\nJane Doe,jane@example.com,invalid"));
  expect(result.failed).toBe(1);
  expect(result.updated).toBe(0);
  expect(updates).toEqual({});
});

test("explicit zero and false values are retained in updates", async () => {
  existing = true;
  const result = await service.importLeads(Buffer.from("full_name,email,score,archived\nJane Doe,jane@example.com,0,false"));
  expect(result.updated).toBe(1);
  expect(updates).toEqual({ full_name: "Jane Doe", score: 0, archived: false });
});

test("CSV project_value and currency map to the lead update", async () => {
  existing = true;
  const result = await service.importLeads(Buffer.from("full_name,email,project_value,currency\nJane Doe,jane@example.com,800000000,USD"));
  expect(result.updated).toBe(1);
  expect(updates).toEqual({ full_name: "Jane Doe", project_value: 800000000, currency: "USD" });
});

test("blank project_value and currency cells are omitted from the update", async () => {
  existing = true;
  updates = {};
  const result = await service.importLeads(Buffer.from("full_name,email,project_value,currency\nJane Doe,jane@example.com,,"));
  expect(result.updated).toBe(1);
  expect(updates).toEqual({ full_name: "Jane Doe" });
});

test("invalid currency value fails without modifying the lead", async () => {
  existing = true;
  updates = {};
  const result = await service.importLeads(Buffer.from("full_name,email,currency\nJane Doe,jane@example.com,DOLLARS"));
  expect(result.failed).toBe(1);
  expect(result.updated).toBe(0);
  expect(updates).toEqual({});
});

test("CSV country maps to the lead update", async () => {
  existing = true;
  updates = {};
  const result = await service.importLeads(Buffer.from("full_name,email,country\nJane Doe,jane@example.com,United Kingdom"));
  expect(result.updated).toBe(1);
  expect(updates).toEqual({ full_name: "Jane Doe", country: "United Kingdom" });
});

test("blank country is omitted from the lead update", async () => {
  existing = true;
  updates = {};
  const result = await service.importLeads(Buffer.from("full_name,email,country\nJane Doe,jane@example.com,"));
  expect(result.updated).toBe(1);
  expect(updates).toEqual({ full_name: "Jane Doe" });
});

test("AI enrichment values are accepted as free-text country", async () => {
  existing = true;
  updates = {};
  const result = await service.importLeads(Buffer.from("full_name,email,country\nJane Doe,jane@example.com,Saudi Arabia"));
  expect(result.updated).toBe(1);
  expect(updates).toEqual({ full_name: "Jane Doe", country: "Saudi Arabia" });
});

test("CSV updates both lead and linked bid and reports bid counts", async () => {
  existing = true;
  const result = await service.importLeads(Buffer.from("full_name,email,status,bid_value,suppliers\nJane Doe,jane@example.com,won,0,A;B"));
  expect(result.updated).toBe(1);
  expect(result.bids_updated).toBe(1);
  expect(bidUpdates).toEqual({ value: 0, suppliers: ["A", "B"] });
  expect(updates).toEqual({ full_name: "Jane Doe", status: "won" });
});

test("bid failure reports partial save explicitly", async () => {
  existing = true;
  bidError = true;
  const result = await service.importLeads(Buffer.from("full_name,email,bid_value\nJane Doe,jane@example.com,15000"));
  expect(result.updated).toBe(1);
  expect(result.bids_failed).toBe(1);
  expect(result.errors[0]?.message).toContain("Lead saved, but bid details failed");
  bidError = false;
});

test("controller surfaces bid failure as partial success with top-level errors", async () => {
  existing = true;
  bidError = true;
  let code: number | undefined;
  let body: any;
  const res = { status(value: number) { code = value; return this; }, json(value: unknown) { body = value; } };
  try {
    await controller.importLeads({ file: { buffer: Buffer.from("full_name,email,bid_value\nJane Doe,jane@example.com,15000") } } as any, res as any);
    expect(code).toBe(200);
    expect(body.success).toBe(false);
    expect(body.partial_success).toBe(true);
    expect(body.data.updated).toBe(1);
    expect(body.data.bids_failed).toBe(1);
    expect(body.errors).toEqual(body.data.errors);
    expect(body.message).toContain("Lead saved, but bid details failed");
  } finally { bidError = false; }
});
