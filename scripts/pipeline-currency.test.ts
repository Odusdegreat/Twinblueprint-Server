import { expect, mock, test } from "bun:test";
const leads = [
  { id: "l1", status: "proposal", archived: false },
  { id: "l2", status: "qualified", archived: false },
];
const bids = [
  { id: "b1", lead_id: "l1", value: 150000, currency: "GBP", status: "Active" },
  { id: "b2", lead_id: "l1", value: 500000, currency: "GBP", status: "Active" },
];
let mixed = false;
mock.module("../src/config/supabase.ts", () => ({ supabase: { from(table: string) {
  let rows: any[] = table === "leads" ? leads : table === "bids" ? (mixed ? [...bids, { id: "b3", lead_id: "l1", value: 250000, currency: "EUR", status: "Active" }] : bids) : [];
  const q: any = {
    select: () => q, order: () => q, eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return q; },
    in: () => q, range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }),
    then: (resolve: any, reject: any) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  }; return q;
} } }));
const { getPipeline } = await import("../src/services/pipeline.service.ts");

test("pipeline stage reports a single shared currency", async () => {
  const stage = (await getPipeline()).stages.find(s => s.name === "Proposal")!;
  expect(stage.currency).toBe("GBP");
  expect(stage.value).toBe(650000);
  expect(stage.pipeline_totals).toEqual([{ currency: "GBP", currency_symbol: "£", pipeline_value: 650000, bid_count: 2 }]);
  expect(stage.bids[0]?.currency).toBe("GBP");
});

test("pipeline stage reports null when currencies are mixed", async () => {
  mixed = true;
  const stage = (await getPipeline()).stages.find(s => s.name === "Proposal")!;
  expect(stage.value).toBeNull();
  expect(stage.currency).toBeNull();
  expect(stage.pipeline_totals).toEqual([
    { currency: "EUR", currency_symbol: "€", pipeline_value: 250000, bid_count: 1 },
    { currency: "GBP", currency_symbol: "£", pipeline_value: 650000, bid_count: 2 },
  ]);
});

test("summary reports per-currency totals and unknown counters", async () => {
  mixed = true;
  const summary = (await getPipeline()).summary;
  expect(summary.total_bid_value).toBe(900000);
  expect(summary.pipeline_totals).toEqual([
    { currency: "EUR", currency_symbol: "€", pipeline_value: 250000, bid_count: 1 },
    { currency: "GBP", currency_symbol: "£", pipeline_value: 650000, bid_count: 2 },
  ]);
  expect(summary.unknown_currency_bid_count).toBe(0);
  expect(summary.unknown_value_bid_count).toBe(0);
});