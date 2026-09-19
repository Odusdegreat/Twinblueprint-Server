import { expect, mock, test } from "bun:test";
let rpc: any;
let rpcError: { code: string; message: string } | null = null;
let rpcData: { lead_id: string } | null = { lead_id: "lead-id" };
mock.module("../src/config/supabase.ts", () => ({ supabase: { rpc: (...args: any[]) => { rpc = args; return { data: rpcData, error: rpcError }; } } }));
const { moveLeadToPipeline } = await import("../src/services/lead.service.ts");
const { moveLeadToPipelineSchema } = await import("../src/validations/bid.validation.ts");
const valid = { project: "P", client: "C", phase: "Shortlist", deadline: "2026-12-01", value: 100, currency: "usd", suppliers: [] };

test("move-to-pipeline accepts unconfirmed amounts and ISO currency", () => {
  expect(moveLeadToPipelineSchema.safeParse({ ...valid }).success).toBe(true);
  expect(moveLeadToPipelineSchema.safeParse({ ...valid, value: undefined, currency: undefined }).success).toBe(true);
  expect(moveLeadToPipelineSchema.safeParse({ ...valid, value: null, currency: null }).success).toBe(true);
  expect(moveLeadToPipelineSchema.parse(valid).currency).toBe("USD");
});

test("invalid amounts and ISO currency are still rejected", () => {
  expect(moveLeadToPipelineSchema.safeParse({ ...valid, value: "abc" }).success).toBe(false);
  expect(moveLeadToPipelineSchema.safeParse({ ...valid, currency: "NOT-CURRENCY" }).success).toBe(false);
  expect(moveLeadToPipelineSchema.safeParse({ ...valid, currency: "" }).success).toBe(false);
  expect(moveLeadToPipelineSchema.safeParse({ ...valid, phase: "Active" }).success).toBe(false);
});

test("service forwards the normalized currency into the RPC call", async () => {
  await moveLeadToPipeline("lead-id", moveLeadToPipelineSchema.parse(valid));
  expect(rpc[0]).toBe("move_lead_to_pipeline");
  expect(rpc[1]).toMatchObject({ p_lead_id: "lead-id", p_value: 100, p_currency: "USD" });
});

test("service forwards explicit nulls when the amount is unconfirmed", async () => {
  await moveLeadToPipeline("lead-id", moveLeadToPipelineSchema.parse({ project: "P", client: "C", phase: "Shortlist", deadline: "2026-12-01", suppliers: [] }));
  expect(rpc[1]).toMatchObject({ p_value: null, p_currency: null });
});

test("a strict DB overlap rejects with a 400, signaling the deployed function is out of date", async () => {
  rpcError = { code: "22023", message: "Numeric value and ISO currency are required" };
  await expect(moveLeadToPipeline("lead-id", moveLeadToPipelineSchema.parse(valid)))
    .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("confirmed numeric value and a valid ISO 4217 currency") });
});

test("a missing RPC signature fails with migration guidance, not a fabricated success", async () => {
  rpcError = { code: "PGRST202", message: "Could not find the function" };
  await expect(moveLeadToPipeline("lead-id", moveLeadToPipelineSchema.parse(valid)))
    .rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining("bid-financials-migration.sql") });
});