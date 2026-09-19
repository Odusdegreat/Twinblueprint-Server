import { z } from "zod/v4";

const DEMO_INDUSTRIES = ["Construction", "Architecture", "Urban Development", "Infrastructure", "Engineering", "Other"] as const;

export const createDemoRequestSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  workEmail: z.string().email("Invalid email address"),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  industry: z.enum(DEMO_INDUSTRIES).optional(),
  confirmationEmail: z.boolean().optional().describe("Deprecated: demo bookings always send the submitter a confirmation"),
});

export type CreateDemoRequestInput = z.infer<typeof createDemoRequestSchema>;
