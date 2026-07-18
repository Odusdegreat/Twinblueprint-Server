import { z } from "zod/v4";

export const createProjectSchema = z.object({
  project: z.string().min(1, "Project name is required"),
  client: z.string().min(1, "Client is required"),
  start: z.string().min(1, "Start date is required"),
  end: z.string().min(1, "End date is required"),
  progress: z.number().min(0).max(100).default(0),
  suppliers: z.array(z.string()).default([]),
  uses_3d: z.boolean().default(false),
  competitor: z.string().nullable().optional(),
  issue: z.string().nullable().optional(),
});

export const updateProjectSchema = z.object({
  project: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  progress: z.number().min(0).max(100).optional(),
  suppliers: z.array(z.string()).optional(),
  uses_3d: z.boolean().optional(),
  competitor: z.string().nullable().optional(),
  issue: z.string().nullable().optional(),
});

export const projectIdParamSchema = z.object({
  id: z.string().uuid("Invalid project ID"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
