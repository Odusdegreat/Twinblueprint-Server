import { z } from "zod/v4";

const nullableText = z.string().trim().min(1).nullable().optional();
const uuidOrNull = z.string().uuid().nullable().optional();

export const opportunityStatus = z.enum(["open", "qualified", "won", "lost"]);

export const createOpportunitySchema = z.object({
  supplier_id: z.string().uuid(),
  lead_id: uuidOrNull,
  project_id: uuidOrNull,
  bid_id: uuidOrNull,
  name: z.string().trim().min(1, "Opportunity name is required"),
  description: nullableText,
  insight: nullableText,
  status: opportunityStatus.default("open"),
  value: z.number().nullable().optional(),
  currency: nullableText,
});

export const updateOpportunitySchema = z.object({
  supplier_id: z.string().uuid().optional(),
  lead_id: uuidOrNull,
  project_id: uuidOrNull,
  bid_id: uuidOrNull,
  name: z.string().trim().min(1).optional(),
  description: nullableText,
  insight: nullableText,
  status: opportunityStatus.optional(),
  value: z.number().nullable().optional(),
  currency: nullableText,
}).refine(data => Object.keys(data).length > 0, "No fields to update");

export const opportunityIdParams = z.object({ id: z.string().uuid() });
export const opportunitySupplierParams = z.object({ id: z.string().uuid(), supplierId: z.string().uuid() });
export const supplierOpportunityParams = z.object({ supplierId: z.string().uuid() });

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;