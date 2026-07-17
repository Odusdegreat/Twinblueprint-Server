import { z } from "zod/v4";

export const createDemoRequestSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  workEmail: z.string().email("Invalid email address"),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  industry: z.string().optional(),
});

export type CreateDemoRequestInput = z.infer<typeof createDemoRequestSchema>;
