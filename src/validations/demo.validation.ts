import { z } from "zod/v4";

const DEMO_CATEGORIES = ["Architecture", "Urban Development", "Infrastructure", "Other"] as const;

export const createDemoRequestSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  workEmail: z.string().email("Invalid email address"),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  category: z.enum(DEMO_CATEGORIES).optional(),
});

export type CreateDemoRequestInput = z.infer<typeof createDemoRequestSchema>;
