import { supabase } from "../config/supabase.ts";
import { currencySymbol, knownCurrency, singleCurrency } from "../config/currencies.ts";
import { enrichBidSuppliers } from "./supplier.service.ts";
import type { Bid } from "../types/bid.types.ts";
import type { Lead, LeadStatus } from "../types/lead.types.ts";
import type { CurrencyTotal, PipelineResponse, PipelineStage } from "../types/pipeline.types.ts";

const PIPELINE_STAGES: Array<{ name: PipelineStage; statuses: LeadStatus[] }> = [
  { name: "Discovery", statuses: ["new", "contacted"] },
  { name: "Qualified", statuses: ["qualified"] },
  { name: "Proposal", statuses: ["proposal"] },
  { name: "Negotiation", statuses: ["negotiation"] },
  { name: "Closed Won", statuses: ["won"] },
];

/** Shared per-currency totals. Known currencies are never added together; unknown currencies and values are counted separately. */
const summarizeFinancials = (
  bids: ReadonlyArray<{ value?: unknown; currency?: unknown }>,
): { pipeline_totals: CurrencyTotal[]; unknown_currency_bid_count: number; unknown_value_bid_count: number; single: CurrencyTotal | null } => {
  const totals = new Map<string, CurrencyTotal>();
  let unknownCurrency = 0;
  let unknownValue = 0;
  for (const bid of bids) {
    const currency = knownCurrency(bid.currency);
    if (!currency) { unknownCurrency++; continue; }
    const value = Number(bid.value);
    if (bid.value === null || bid.value === undefined || !Number.isFinite(value)) { unknownValue++; continue; }
    const total = totals.get(currency) ?? { currency, currency_symbol: currencySymbol(currency), pipeline_value: 0, bid_count: 0 };
    total.pipeline_value += value;
    total.bid_count++;
    totals.set(currency, total);
  }
  const pipeline_totals = [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  const single = pipeline_totals.length === 1 ? pipeline_totals[0]! : null;
  return { pipeline_totals, unknown_currency_bid_count: unknownCurrency, unknown_value_bid_count: unknownValue, single };
};

export const getPipeline = async (): Promise<PipelineResponse> => {
  const [bidsResult, projectsResult, leadsResult] = await Promise.all([
    supabase
      .from("bids")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("leads")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: false }),
  ]);

  if (bidsResult.error) {
    console.error("[PIPELINE] getBids error:", bidsResult.error);
    throw Object.assign(new Error("Failed to fetch pipeline"), {
      statusCode: 500,
    });
  }

  if (projectsResult.error) {
    console.error("[PIPELINE] getProjects error:", projectsResult.error);
    throw Object.assign(new Error("Failed to fetch pipeline"), {
      statusCode: 500,
    });
  }

  if (leadsResult.error) {
    console.error("[PIPELINE] getLeads error:", leadsResult.error);
    throw Object.assign(new Error("Failed to fetch pipeline"), {
      statusCode: 500,
    });
  }

  const active_bids = await enrichBidSuppliers((bidsResult.data ?? []).filter(
    (bid) => bid.status.toLowerCase() === "active",
  ) as Bid[]);
  const inflight_projects = (projectsResult.data ?? []).filter(
    (project) => project.status.toLowerCase() === "in-flight",
  );
  const leads = (leadsResult.data ?? []) as Lead[];
  const activeTotals = summarizeFinancials(active_bids);

  const total_bid_value = active_bids.reduce(
    (sum, bid) => sum + (Number(bid.value) || 0),
    0,
  );

  return {
    stages: PIPELINE_STAGES.map(({ name, statuses }) => {
      const stageLeads = leads.filter((lead) => statuses.includes(lead.status));
      const leadIds = new Set(stageLeads.map((lead) => lead.id));
      const bids = ((bidsResult.data ?? []) as Bid[]).filter((bid) => bid.lead_id !== null && leadIds.has(bid.lead_id));
      const financials = summarizeFinancials(bids);

      return {
        name,
        count: stageLeads.length,
        value: bids.length === 0 ? 0 : financials.single?.pipeline_value ?? null,
        currency: singleCurrency(bids),
        pipeline_totals: financials.pipeline_totals,
        unknown_currency_bid_count: financials.unknown_currency_bid_count,
        unknown_value_bid_count: financials.unknown_value_bid_count,
        leads: stageLeads,
        bids,
      };
    }),
    active_bids,
    inflight_projects,
    summary: {
      total_bids: active_bids.length,
      total_projects: inflight_projects.length,
      total_bid_value,
      pipeline_totals: activeTotals.pipeline_totals,
      unknown_currency_bid_count: activeTotals.unknown_currency_bid_count,
      unknown_value_bid_count: activeTotals.unknown_value_bid_count,
    },
  };
};
