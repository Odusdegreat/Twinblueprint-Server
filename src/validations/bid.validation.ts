import { z } from "zod/v4";
import { currencySchema } from "../config/currencies.ts";

const bidDeadlineSchema = z.iso.date({ error: "Deadline must be a valid date in YYYY-MM-DD format (for example, 2026-12-09)" });
const bidPhaseSchema = z.enum(["RFP Review", "Technical Eval", "Shortlist"], {
  error: "Phase must be RFP Review, Technical Eval, or Shortlist; Active is a bid status, not a phase",
});

export const bidFinancialsSchema = z.object({ value: z.number(), currency: currencySchema });
export const bidFinancialsNullableSchema = z.object({
  value: z.number().nullable().optional(),
  currency: currencySchema.nullable().optional(),
});

export const createBidSchema = z.object({
  project: z.string().min(1, "Project name is required"),
  client: z.string().min(1, "Client is required"),
  phase: bidPhaseSchema,
  deadline: bidDeadlineSchema,
  suppliers: z.array(z.string()).default([]),
  value: z.number().nullable().optional(),
  currency: currencySchema.nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  status: z.string().min(1).default("Active"),
});

export const updateBidSchema = z.object({
  project: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  phase: bidPhaseSchema.optional(),
  deadline: bidDeadlineSchema.optional(),
  suppliers: z.array(z.string()).optional(),
  value: z.number().nullable().optional(),
  currency: currencySchema.nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  status: z.string().min(1).optional(),
});

export type CreateBidInput = z.infer<typeof createBidSchema>;
export type UpdateBidInput = z.infer<typeof updateBidSchema>;

// Moving a lead into the pipeline creates a bid server-side via
// public.move_lead_to_pipeline. Amount and currency follow the same rule as
// general bid writes: omitted or NULL means the value is not yet confirmed and
// is stored as NULL (see scripts/bid-financials-migration.sql).
export const moveLeadToPipelineSchema = createBidSchema.omit({
  lead_id: true,
  status: true,
});

export type MoveLeadToPipelineInput = z.infer<typeof moveLeadToPipelineSchema>;
