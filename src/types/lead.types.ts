export type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "won";

export interface Lead {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  industry: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}
