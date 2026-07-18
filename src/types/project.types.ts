export interface Project {
  id: string;
  project: string;
  client: string;
  start: string;
  end: string;
  progress: number;
  suppliers: string[];
  uses_3d: boolean;
  competitor: string | null;
  issue: string | null;
  created_at: string;
}
