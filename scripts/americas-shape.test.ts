import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
let leads: any[]; let bids: any[]; let missingCurrency: boolean; let missingCountry: boolean;
mock.module("../src/config/supabase.ts", () => ({ supabase: { from(table: string) {
  let columns = ""; let rows = table === "leads" ? leads : bids;
  const q: any = {
    select: (value: string) => { columns = value; return q; }, order: () => q,
    eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return q; },
    range: async (start: number, end: number) => {
      if ((table === "bids" && missingCurrency && columns.includes("currency")) || (table === "leads" && missingCountry && columns.includes("country"))) {
        return { data: null, error: { code: "42703", message: `column ${table === "bids" ? "currency" : "country"} does not exist` } };
      }
      const keys = columns.split(",");
      return { data: rows.slice(start, end + 1).map(row => Object.fromEntries(keys.map(key => [key, row[key]]))), error: null };
    },
  }; return q;
} } }));
const { getRegionalDashboard } = await import("../src/services/region.service.ts");
const log = spyOn(console, "error").mockImplementation(() => {});
afterAll(() => log.mockRestore());
beforeEach(() => {
  leads = [
    { id: "na", region: "North America", country: "United States", archived: false },
    { id: "latam", region: "Latin America", country: "Mexico", archived: false },
    { id: "uk", region: "UK & Ireland", country: "United Kingdom", archived: false },
  ];
  bids = [
    { id: "b1", lead_id: "na", value: 9000000, currency: "USD" },
    { id: "b2", lead_id: "latam", value: 1000000, currency: "USD" },
    { id: "b3", lead_id: "uk", value: 1200000000, currency: "GBP" },
  ];
  missingCurrency = false; missingCountry = false;
});
const keys = (value: Record<string, unknown>) => Object.keys(value).sort();

test("americas returns the identical dashboard shape as emea", async () => {
  const emea = await getRegionalDashboard("emea");
  const americas = await getRegionalDashboard("americas");
  expect(keys(americas)).toEqual(keys(emea));
  expect(keys(americas.summary[0]!)).toEqual(keys(emea.summary[0]!));
  expect(keys(americas.regions[0]!)).toEqual(keys(emea.regions[0]!));
});

test("summary carries the pipeline money fields the layout renders", async () => {
  const { summary } = await getRegionalDashboard("americas");
  expect(summary).toHaveLength(2);
  const north = summary.find(r => r.name === "North America")!;
  const latam = summary.find(r => r.name === "Latin America")!;
  for (const row of [north, latam]) {
    expect(row.lead_count).toBe(1);
    expect(row.pipeline_value).toBe(row === north ? 9000000 : 1000000);
    expect(row.currency).toBe("USD"); expect(row.currency_symbol).toBe("$");
    expect(row.reporting_currency).toBe("USD"); expect(row.reporting_currency_symbol).toBe("$");
    expect(row.reporting_currency_source).toBe("design_reference_pending_confirmation");
    expect(row.unknown_currency_bid_count).toBe(0); expect(row.unknown_value_bid_count).toBe(0);
    expect(row.conversion_date).toBeNull();
    expect(Array.isArray(row.pipeline_totals)).toBe(true);
  }
});

test("panel carries the layout fields including countries, tools, and strategy", async () => {
  const { regions } = await getRegionalDashboard("americas");
  const north = regions.find(r => r.name === "North America")!;
  const latam = regions.find(r => r.name === "Latin America")!;
  expect(north.name).toBe("North America"); expect(north.lead_count).toBe(1);
  expect(north.bids_count).toBe(1); expect(north.inflight_count).toBe(0);
  expect(north.countries).toEqual([{ name: "United States", lead_count: 1 }]);
  expect(north.recommended_tools).toBeNull(); expect(north.strategy).toBe("Target early design phase");
  expect(latam.countries).toEqual([{ name: "Mexico", lead_count: 1 }]);
});

test("legacy missing columns degrade the same way as emea", async () => {
  missingCurrency = true; missingCountry = true;
  const result = await getRegionalDashboard("americas");
  expect(result.summary[0]!.currency).toBeNull(); expect(result.summary[0]!.pipeline_value).toBeNull();
  expect(result.regions[0]!.countries).toBeNull(); expect(result.regions[0]!.country_counts_complete).toBe(false);
  expect(result.data_availability).toEqual({ bid_currency: false, lead_country: false, recommended_tools: false });
});