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
  created_at: string;
}
