export type OpportunityStatus = "open" | "qualified" | "won" | "lost";

export interface Opportunity {
  id: string;
  supplier_id: string;
  lead_id: string | null;
  project_id: string | null;
  bid_id: string | null;
  name: string;
  description: string | null;
  insight: string | null;
  status: OpportunityStatus;
  value: number | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierOpportunity extends Opportunity {
  project: string | null;
}