import { z } from "zod/v4";

export const createProjectSchema = z.object({
  project: z.string().min(1, "Project name is required"),
  client: z.string().min(1, "Client is required"),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  progress: z.coerce.number().min(0).max(100).default(0),
  suppliers: z.array(z.string()).default([]),
  uses_3d: z.coerce.boolean().default(false),
  competitor: z.string().nullable().optional(),
  issue: z.string().nullable().optional(),
});

export const updateProjectSchema = z.object({
  project: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  start_date: z.string().min(1).optional(),
  end_date: z.string().min(1).optional(),
  progress: z.coerce.number().min(0).max(100).optional(),
  suppliers: z.array(z.string()).optional(),
  uses_3d: z.coerce.boolean().optional(),
  competitor: z.string().nullable().optional(),
  issue: z.string().nullable().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
