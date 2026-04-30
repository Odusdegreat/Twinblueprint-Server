export interface CreateDemoRequestDTO {
  fullName: string;
  workEmail: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  industry?: string;
}

export interface DemoResponseDTO {
  id: string;
  fullName: string;
  workEmail: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  industry?: string;
  createdAt: Date;
}
