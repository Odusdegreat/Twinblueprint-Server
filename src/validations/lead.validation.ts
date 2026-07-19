import { z } from "zod/v4";

export const createLeadSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  company: z.string().optional(),
  job_title: z.string().optional(),
  phone: z.string().optional(),
  category: z.string().optional(),
  applications: z.coerce.number().min(0).default(0),
  score: z.coerce.number().min(0).max(100).default(0),
});

export const updateLeadSchema = z.object({
  full_name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  company: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  applications: z.coerce.number().min(0).optional(),
  score: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(["new", "contacted", "qualified", "lost", "won"]).optional(),
});

export const assignLeadSchema = z.object({
  assigned_to: z.string().min(1, "Invalid user ID"),
});

export const leadIdParamSchema = z.object({
  id: z.string().uuid("Invalid lead ID"),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;
