import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
let leads: any[]; let bids: any[]; let missingCurrency: boolean; let missingCountry: boolean; let bidFailure: boolean;
mock.module("../src/config/supabase.ts", () => ({ supabase: { from(table: string) {
  let columns = ""; let rows = table === "leads" ? leads : bids;
  const q: any = {
    select: (value: string) => { columns = value; return q; }, order: () => q,
    eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return q; },
    range: async (start: number, end: number) => {
      if (table === "bids" && bidFailure) return { data: null, error: { code: "42501", message: "Permission denied" } };
      if ((table === "bids" && missingCurrency && columns.includes("currency")) || (table === "leads" && missingCountry && columns.includes("country"))) {
        return { data: null, error: { code: "42703", message: `column ${table === "bids" ? "currency" : "country"} does not exist` } };
      }
      const keys = columns.split(",");
      return { data: rows.slice(start, end + 1).map(row => Object.fromEntries(keys.map(key => [key, row[key]]))), error: null };
    },
  }; return q;
} } }));
const { getRegionalDashboard, summarizeRegionalBids } = await import("../src/services/region.service.ts");
const { currencySymbol } = await import("../src/config/currencies.ts");
const { createBidSchema, updateBidSchema, moveLeadToPipelineSchema } = await import("../src/validations/bid.validation.ts");
const log = spyOn(console, "error").mockImplementation(() => {});
afterAll(() => log.mockRestore());
beforeEach(() => {
  leads = [{ id: "uk", region: "UK & Ireland", country: "United Kingdom", archived: false }];
  bids = [{ id: "b1", lead_id: "uk", value: 1200000000, currency: "GBP" }];
  missingCurrency = false; missingCountry = false; bidFailure = false;
});
test("summary and panel pair a known amount with its source ISO currency and symbol", async () => {
  const result = await getRegionalDashboard("emea");
  for (const row of [result.summary[0]!, result.regions[0]!]) {
    expect(row.pipeline_value).toBe(1200000000); expect(row.currency).toBe("GBP"); expect(row.currency_symbol).toBe("£");
  }
  expect(result.regions[0]!.reporting_currency).toBe("GBP"); expect(result.regions[0]!.reporting_currency_symbol).toBe("£");
  expect(result.regions[0]!.countries).toEqual([{ name: "United Kingdom", lead_count: 1 }]);
  expect(result.regions[0]!.recommended_tools).toBeNull();
});
test("mixed currencies remain separate and are never directly added", async () => {
  bids.push({ id: "b2", lead_id: "uk", value: 890000000, currency: "EUR" });
  const row = (await getRegionalDashboard("emea")).summary[0]!;
  expect(row.pipeline_value).toBeNull(); expect(row.currency).toBeNull(); expect(row.currency_symbol).toBeNull();
  expect(row.pipeline_totals).toEqual([{ currency: "EUR", currency_symbol: "€", pipeline_value: 890000000, bid_count: 1 }, { currency: "GBP", currency_symbol: "£", pipeline_value: 1200000000, bid_count: 1 }]);
  expect(row.conversion_date).toBeNull();
});
test("design reporting policy does not relabel a source amount", async () => {
  bids[0].currency = "USD";
  const row = (await getRegionalDashboard("emea")).summary[0]!;
  expect(row.reporting_currency).toBe("GBP"); expect(row.reporting_currency_symbol).toBe("£");
  expect(row.currency).toBe("USD"); expect(row.currency_symbol).toBe("$");
  expect(row.reporting_currency_source).toBe("design_reference_pending_confirmation");
});
test("legacy missing columns return unknown data instead of invented currency/country", async () => {
  missingCurrency = true; missingCountry = true;
  const result = await getRegionalDashboard("emea");
  expect(result.summary[0]!.currency).toBeNull(); expect(result.summary[0]!.currency_symbol).toBeNull(); expect(result.summary[0]!.pipeline_value).toBeNull();
  expect(result.summary[0]!.pipeline_totals).toEqual([]);
  expect(result.regions[0]!.countries).toBeNull(); expect(result.regions[0]!.country_counts_complete).toBe(false);
  expect(result.regions[0]!.country_unassigned_lead_count).toBe(1);
});
test("unknown currency and unknown amount never become zero-valued known totals", () => {
  const result = summarizeRegionalBids([
    { id: "a", lead_id: "l", value: 10, currency: "GBP" },
    { id: "b", lead_id: "l", value: 20, currency: null },
    { id: "c", lead_id: "l", value: null, currency: "EUR" },
  ]);
  expect(result.pipeline_value).toBeNull(); expect(result.currency).toBeNull();
  expect(result.pipeline_totals).toEqual([{ currency: "GBP", currency_symbol: "£", pipeline_value: 10, bid_count: 1 }]);
  expect(result.unknown_currency_bid_count).toBe(1); expect(result.unknown_value_bid_count).toBe(1);
});
test("actual zero retains known currency; empty pipeline does not invent a currency", () => {
  expect(summarizeRegionalBids([{ id: "b", lead_id: "l", value: 0, currency: "EUR" }])).toMatchObject({ pipeline_value: 0, currency: "EUR", currency_symbol: "€" });
  expect(summarizeRegionalBids([])).toMatchObject({ pipeline_value: 0, currency: null, currency_symbol: null });
});
test("currency symbols are rendered for direct display", () => {
  expect(currencySymbol("GBP")).toBe("£");
  expect(currencySymbol("USD")).toBe("$");
  expect(currencySymbol("NGN")).toBe("₦");
  expect(currencySymbol(null)).toBeNull();
  expect(currencySymbol("ZZZ")).toBeNull();
});
test("country counts reflect recorded countries and disclose incomplete coverage", async () => {
  leads.push({ id: "ie", region: "UK & Ireland", country: "Ireland", archived: false }, { id: "unknown", region: "UK & Ireland", country: null, archived: false }, { id: "old", region: "UK & Ireland", country: "Ireland", archived: true });
  const row = (await getRegionalDashboard("emea")).regions[0]!;
  expect(row.countries).toEqual([{ name: "Ireland", lead_count: 1 }, { name: "United Kingdom", lead_count: 1 }]);
  expect(row.lead_count).toBe(3); expect(row.country_unassigned_lead_count).toBe(1); expect(row.country_counts_complete).toBe(false);
});
test("pagination counts more than 1000 leads and linked bids", async () => {
  leads = Array.from({ length: 1001 }, (_, i) => ({ id: `l${i}`, region: "Africa", country: "Nigeria", archived: false }));
  bids = leads.map(lead => ({ id: `b${lead.id}`, lead_id: lead.id, value: 1, currency: "USD" }));
  const row = (await getRegionalDashboard("emea")).summary[0]!;
  expect(row.lead_count).toBe(1001); expect(row.pipeline_value).toBe(1001); expect(row.currency).toBe("USD");
});
test("bid query failures are not returned as zero pipeline", async () => {
  bidFailure = true;
  await expect(getRegionalDashboard("emea")).rejects.toMatchObject({ statusCode: 500 });
});
test("bid writes validate and normalize source currency without a geography default", () => {
  expect(updateBidSchema.parse({ value: 100, currency: "gbp" }).currency).toBe("GBP");
  expect(updateBidSchema.safeParse({ value: 100, currency: null }).success).toBe(true);
  expect(updateBidSchema.safeParse({ value: 100, currency: "ZZZ" }).success).toBe(false);
  expect(createBidSchema.parse({ project: "P", client: "C", phase: "Shortlist", deadline: "2026-12-01", value: 100, currency: "ngn" }).currency).toBe("NGN");
  expect(createBidSchema.safeParse({ project: "P", client: "C", phase: "Shortlist", deadline: "2026-12-01", value: 100 }).success).toBe(true);
  expect(moveLeadToPipelineSchema.safeParse({ project: "P", client: "C", phase: "Shortlist", deadline: "2026-12-01", value: 100 }).success).toBe(true);
});
