export interface CreateDemoRequestDTO {
  fullName: string;
  workEmail: string;
  company?: string;
}

export interface DemoLead {
  id: string;
  fullName: string;
  workEmail: string;
  company?: string;
  createdAt: Date;
}
