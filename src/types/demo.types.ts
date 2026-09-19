export interface CreateDemoRequestDTO {
  fullName: string;
  workEmail: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  industry?: string;
  /** @deprecated Demo bookings always send the submitter a confirmation. */
  confirmationEmail?: boolean;
}
