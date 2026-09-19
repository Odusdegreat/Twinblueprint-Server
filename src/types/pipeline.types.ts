import type { Bid } from "./bid.types.ts";
import type { Supplier } from "../validations/supplier.validation.ts";
import type { Lead } from "./lead.types.ts";
import type { Project } from "./project.types.ts";

export type PipelineStage = "Discovery" | "Qualified" | "Proposal" | "Negotiation" | "Closed Won";

export interface CurrencyTotal {
  currency: string;
  currency_symbol: string | null;
  pipeline_value: number;
  bid_count: number;
}

export interface PipelineResponse {
  stages: Array<{
    name: PipelineStage;
    count: number;
    value: number | null;
    currency: string | null;
    pipeline_totals: CurrencyTotal[];
    unknown_currency_bid_count: number;
    unknown_value_bid_count: number;
    leads: Lead[];
    bids: Bid[];
  }>;
  active_bids: Array<Bid & { supplier_details: Supplier[] }>;
  inflight_projects: Project[];
  summary: {
    total_bids: number;
    total_projects: number;
    total_bid_value: number;
    pipeline_totals: CurrencyTotal[];
    unknown_currency_bid_count: number;
    unknown_value_bid_count: number;
  };
}
