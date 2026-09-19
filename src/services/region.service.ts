import { supabase } from "../config/supabase.ts";
import { AMERICAS_REFERENCE_REPORTING_CURRENCIES, EMEA_REFERENCE_REPORTING_CURRENCIES, currencySymbol, knownCurrency } from "../config/currencies.ts";

const referenceReportingCurrencies = (scope: "emea" | "americas") => scope === "emea" ? EMEA_REFERENCE_REPORTING_CURRENCIES : AMERICAS_REFERENCE_REPORTING_CURRENCIES;

const groupName = (region: string) => region.includes("UK") ? "UK & Ireland" : region;

interface RegionalLead { id: string; region: string | null; phase?: string | null; lead_status?: string | null; country?: string | null }
interface RegionalBid { id: string; lead_id: string | null; value: number | string | null; currency?: string | null }

const readRows = async <T>(table: "leads" | "bids", columns: string) => {
  const rows: T[] = [];
  while (true) {
    let query = supabase.from(table).select(columns).order("id", { ascending: true });
    if (table === "leads") query = query.eq("archived", false);
    const { data, error } = await query.range(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data as T[]);
  }
};
const readOptionalColumn = async <T>(table: "leads" | "bids", base: string, optional: string) => {
  try { return { rows: await readRows<T>(table, `${base},${optional}`), available: true }; }
  catch (error) {
    const failure = error as { code?: string; message?: string };
    if (["42703", "PGRST204"].includes(failure.code ?? "") && failure.message?.includes(optional)) {
      return { rows: await readRows<T>(table, base), available: false };
    }
    throw error;
  }
};

export const summarizeRegionalBids = (bids: RegionalBid[]) => {
  const totals = new Map<string, { currency: string; currency_symbol: string | null; pipeline_value: number; bid_count: number }>();
  let unknownCurrency = 0; let unknownValue = 0;
  for (const bid of bids) {
    const currency = knownCurrency(bid.currency);
    if (!currency) unknownCurrency++;
    const value = bid.value === null || bid.value === undefined || bid.value === "" ? null : Number(bid.value);
    if (value === null || !Number.isFinite(value)) { unknownValue++; continue; }
    if (!currency) continue; // Unknown currencies must not be added together.
    const total = totals.get(currency) ?? { currency, currency_symbol: currencySymbol(currency), pipeline_value: 0, bid_count: 0 };
    total.pipeline_value += value; total.bid_count++;
    totals.set(currency, total);
  }
  const pipeline_totals = [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  const single = pipeline_totals.length === 1 && unknownCurrency === 0 && unknownValue === 0 ? pipeline_totals[0]! : null;
  return {
    pipeline_value: bids.length === 0 ? 0 : single?.pipeline_value ?? null, currency: single?.currency ?? null,
    currency_symbol: single?.currency ? currencySymbol(single.currency) : null,
    pipeline_totals, unknown_currency_bid_count: unknownCurrency, unknown_value_bid_count: unknownValue, conversion_date: null,
  };
};

export const getRegionalDashboard = async (scope: "emea" | "americas") => {
  const keywords = scope === "emea" ? ["EMEA", "Europe", "Africa", "Middle East", "UK"] : ["Americas", "America", "US", "Canada", "LATAM"];
  let leadData: { rows: RegionalLead[]; available: boolean };
  let bidData: { rows: RegionalBid[]; available: boolean };
  try {
    [leadData, bidData] = await Promise.all([
      readOptionalColumn<RegionalLead>("leads", "id,region,phase,lead_status", "country"),
      readOptionalColumn<RegionalBid>("bids", "id,lead_id,value", "currency"),
    ]);
  } catch (error) {
    console.error("[REGIONS] Failed to load regional data", error);
    throw Object.assign(new Error("Failed to load regional data"), { statusCode: 500 });
  }
  const byRegion = new Map<string, RegionalLead[]>();
  const leadRegions = new Map<string, string>();
  for (const lead of leadData.rows) {
    if (!keywords.some(keyword => (lead.region ?? "").toLowerCase().includes(keyword.toLowerCase()))) continue;
    const name = groupName(lead.region!);
    const rows = byRegion.get(name) ?? []; rows.push(lead); byRegion.set(name, rows);
    leadRegions.set(lead.id, name);
  }
  const bidsByRegion = new Map<string, RegionalBid[]>();
  for (const bid of bidData.rows) {
    const name = bid.lead_id ? leadRegions.get(bid.lead_id) : undefined;
    if (!name) continue;
    const rows = bidsByRegion.get(name) ?? []; rows.push(bid); bidsByRegion.set(name, rows);
  }
  const regions = [...byRegion].map(([name, rows]) => {
    const bids = bidsByRegion.get(name) ?? [];
    const countryCounts = new Map<string, number>();
    for (const lead of rows) {
      const country = lead.country?.trim();
      if (country) countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    }
    return {
      name, lead_count: rows.length, bids_count: bids.length,
      inflight_count: rows.filter(lead => lead.phase === "In-flight" || lead.lead_status === "Inflight").length,
      ...summarizeRegionalBids(bids),
      reporting_currency: referenceReportingCurrencies(scope)[name] ?? null,
      reporting_currency_symbol: referenceReportingCurrencies(scope)[name] ? currencySymbol(referenceReportingCurrencies(scope)[name]!) : null,
      reporting_currency_source: referenceReportingCurrencies(scope)[name] ? "design_reference_pending_confirmation" : null,
      countries: leadData.available ? [...countryCounts].sort(([a], [b]) => a.localeCompare(b)).map(([name, lead_count]) => ({ name, lead_count })) : null,
      country_counts_complete: leadData.available && rows.every(lead => !!lead.country?.trim()),
      country_unassigned_lead_count: rows.filter(lead => !lead.country?.trim()).length,
      recommended_tools: null, recommended_tools_status: "awaiting_approved_source",
      strategy: "Target early design phase",
    };
  });
  const summary = regions.map(({ name, lead_count, pipeline_value, currency, currency_symbol, pipeline_totals, unknown_currency_bid_count, unknown_value_bid_count, reporting_currency, reporting_currency_symbol, reporting_currency_source, conversion_date }) => ({
    name, lead_count, pipeline_value, currency, currency_symbol, pipeline_totals, unknown_currency_bid_count, unknown_value_bid_count, reporting_currency, reporting_currency_symbol, reporting_currency_source, conversion_date,
  }));
  return { summary, workflow: [], regions, data_availability: { bid_currency: bidData.available, lead_country: leadData.available, recommended_tools: false } };
};
