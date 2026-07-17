import { z } from "zod/v4";

export const createLeadSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  company: z.string().optional(),
  job_title: z.string().optional(),
  phone: z.string().optional(),
  industry: z.string().optional(),
});

export const updateLeadSchema = z.object({
  full_name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  company: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  status: z.enum(["new", "contacted", "qualified", "lost", "won"]).optional(),
});

export const assignLeadSchema = z.object({
  assigned_to: z.string().uuid("Invalid user ID"),
});

export const leadIdParamSchema = z.object({
  id: z.string().uuid("Invalid lead ID"),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;
