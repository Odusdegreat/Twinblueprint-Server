import { expect, mock, test } from "bun:test";
const leads = [
  { id: "won", status: "won", region: "Africa", archived: false, project_size: "$900M" },
  { id: "open", status: "proposal", region: "Africa", archived: false },
  { id: "null", status: "won", region: "Africa", archived: false },
  { id: "zero", status: "won", region: "UK & Ireland", archived: false },
  { id: "archived", status: "won", region: "Africa", archived: true },
];
const bids = [
  { lead_id: "won", value: 15000, currency: "USD" }, { lead_id: "open", value: 80000, currency: "USD" },
  { lead_id: "null", value: null, currency: "USD" }, { lead_id: "zero", value: 0, currency: "GBP" },
  { lead_id: "archived", value: 90000, currency: "USD" }, { lead_id: null, value: 30000, currency: "USD" },
];
mock.module("../src/config/supabase.ts", () => ({ supabase: { from(table: string) {
  let rows: any[] = table === "leads" ? leads : table === "bids" ? bids : [];
  const q: any = { select: () => q, gte: () => q, lt: () => q, order: () => q,
    range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }),
    eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return q; },
    then: (resolve: any, reject: any) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject),
  }; return q;
} } }));
const { getDashboard } = await import("../src/services/analytics.service.ts");
test("regional won value counts only linked bids of non-archived won leads and reports the source currency", async () => {
  const result = await getDashboard(1);
  expect(result.regional_coverage).toEqual([
    { region: "Africa", lead_count: 3, pipeline_value: 95000, won_deal_value: 15000, currency: "USD" },
    { region: "UK & Ireland", lead_count: 1, pipeline_value: 0, won_deal_value: 0, currency: "GBP" },
  ]);
});

test("a region with mixed currencies reports null rather than a misleading currency", async () => {
  bids.push({ lead_id: "open", value: 5000, currency: "EUR" });
  const result = await getDashboard(1);
  const africa = result.regional_coverage.find((row: any) => row.region === "Africa")!;
  expect(africa.currency).toBeNull();
});