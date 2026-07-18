import { z } from "zod/v4";

export const createBidSchema = z.object({
  project: z.string().min(1, "Project name is required"),
  client: z.string().min(1, "Client is required"),
  phase: z.enum(["RFP Review", "Technical Eval", "Shortlist"]),
  deadline: z.string().min(1, "Deadline is required"),
  suppliers: z.array(z.string()).default([]),
  value: z.string().optional(),
});

export const updateBidSchema = z.object({
  project: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  phase: z.enum(["RFP Review", "Technical Eval", "Shortlist"]).optional(),
  deadline: z.string().min(1).optional(),
  suppliers: z.array(z.string()).optional(),
  value: z.string().nullable().optional(),
});

export const bidIdParamSchema = z.object({
  id: z.string().uuid("Invalid bid ID"),
});

export type CreateBidInput = z.infer<typeof createBidSchema>;
export type UpdateBidInput = z.infer<typeof updateBidSchema>;
