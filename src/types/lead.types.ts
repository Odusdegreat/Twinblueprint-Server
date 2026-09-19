export type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
export type LeadPhase = "Discovery" | "Bid" | "In-flight";
export type LeadLifecycleStatus = "New" | "Identified" | "Bidding" | "Inflight" | "Closed";
export type LeadTemperature = "hot" | "warm" | "cool";

export interface Lead {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  industry: string | null;
  region: string | null;
  region_group: string | null;
  country: string | null;
  state: string | null;
  project: string | null;
  project_size: string | null;
  project_value: number | null;
  currency: string | null;
  phase: LeadPhase | null;
  lead_status: LeadLifecycleStatus | null;
  applications: number;
  application_tools: string[];
  score: number;
  status: LeadStatus;
  assigned_to: number | null;
  archived: boolean;
  temperature: LeadTemperature;
  created_at: string;
  updated_at: string;
}
