export const PROJECT_STATUSES = ["Active", "In-flight", "On Hold", "Completed", "Cancelled"] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];
export const PROJECT_PHASES = ["Planning", "Design", "Construction", "In Progress", "Completed"] as const;
export type ProjectPhase = typeof PROJECT_PHASES[number];

export interface Project {
  id: string;
  project: string;
  client: string;
  start_date: string;
  end_date: string;
  progress: number;
  suppliers: string[];
  uses_3d: boolean;
  competitor: string | null;
  issue: string | null;
  bid_id: string | null;
  status: ProjectStatus;
  phase: ProjectPhase;
  value: number | null;
  currency: string | null;
  created_at: string;
}
