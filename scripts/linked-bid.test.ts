import { beforeEach, expect, mock, test } from "bun:test";

const leadId = "a9cb07ef-2130-4b96-b657-6a415d1dea3e";
let leads: any[];
let bids: any[];
let writeError: any;
mock.module("../src/config/supabase.ts", () => ({ supabase: {
  from(table: string) {
    let filters: ((row: any) => boolean)[] = [];
    let limit = Infinity;
    let update: any;
    let insert: any;
    const execute = () => {
      let rows = (table === "leads" ? leads : table === "bids" ? bids : []).filter(row => filters.every(f => f(row))).slice(0, limit);
      if (insert || update) {
        if (writeError) return { data: null, error: writeError };
        if (insert) { rows = [{ id: "bid-1", ...insert }]; bids.push(...rows); }
        if (update) rows.forEach(row => Object.assign(row, update));
      }
      return { data: rows, error: null };
    };
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
      limit: (value: number) => { limit = value; return query; },
      order: () => query,
      insert: (value: any) => { insert = value; return query; },
      update: (value: any) => { update = value; return query; },
      maybeSingle: async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; },
      single: async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; },
      then: (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject),
    };
    return query;
  },
} }));
const service = await import("../src/services/bid.service.ts");
const { getPipeline } = await import("../src/services/pipeline.service.ts");
const { createBidSchema, updateBidSchema } = await import("../src/validations/bid.validation.ts");
const input = () => createBidSchema.parse({ lead_id: leadId, project: "Confirmed project", client: "Vibely", phase: "Shortlist", deadline: "2026-12-01", value: null, suppliers: [] });
beforeEach(() => {
  leads = [{ id: leadId, status: "won", archived: false, project_size: "$800M-$900M" }];
  bids = [];
  writeError = null;
});

test("create and edit preserve won status and project size; zero and null survive pipeline response", async () => {
  const bid = await service.createBid(input());
  expect(bid.value).toBeNull();
  expect(bid.suppliers).toEqual([]);
  await service.updateBid(bid.id, updateBidSchema.parse({ lead_id: leadId, value: 0, suppliers: ["Supplier A"], status: "Won" }));
  const pipeline = await getPipeline();
  const stage = pipeline.stages.find(s => s.name === "Closed Won")!;
  expect(stage.bids[0]?.lead_id).toBe(stage.leads[0]?.id);
  expect(typeof stage.bids[0]?.lead_id).toBe("string");
  expect(stage.bids[0]?.value).toBe(0);
  expect(stage.bids[0]?.suppliers).toEqual(["Supplier A"]);
  expect(stage.leads[0]?.status).toBe("won");
  expect(stage.leads[0]?.project_size).toBe("$800M-$900M");
  expect(pipeline.active_bids).toEqual([]);
  await service.updateBid(bid.id, { value: null, suppliers: [] });
  expect((await getPipeline()).stages.find(s => s.name === "Closed Won")?.bids[0]?.value).toBeNull();
});

test("duplicate create and relink are rejected", async () => {
  await service.createBid(input());
  await expect(service.createBid(input())).rejects.toMatchObject({ statusCode: 409 });
  await expect(service.updateBid("another-bid", { lead_id: leadId })).rejects.toMatchObject({ statusCode: 409 });
  expect(bids).toHaveLength(1);
});

test("missing lead and concurrent duplicate have useful errors", async () => {
  await expect(service.createBid({ ...input(), lead_id: "missing" })).rejects.toMatchObject({ statusCode: 404 });
  writeError = { code: "23505" };
  await expect(service.createBid(input())).rejects.toMatchObject({ statusCode: 409 });
});

test("amount accepts only actual numbers or null", () => {
  for (const value of [null, 0, 15000]) expect(updateBidSchema.safeParse({ value }).success).toBe(true);
  for (const value of ["", false, "15000"]) expect(updateBidSchema.safeParse({ value }).success).toBe(false);
});

test("bid source currency persists and can be explicitly cleared", async () => {
  const bid = await service.createBid({ ...input(), currency: "GBP" });
  expect(bid.currency).toBe("GBP");
  await service.updateBid(bid.id, { currency: "EUR" });
  expect(bids[0].currency).toBe("EUR");
  await service.updateBid(bid.id, { currency: null });
  expect(bids[0].currency).toBeNull();
});
