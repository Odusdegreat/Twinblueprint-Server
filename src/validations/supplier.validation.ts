import { z } from "zod/v4";
const optionalText = z.string().trim().min(1).nullable();
export const supplierSchema = z.object({
  name: z.string().trim().min(1),
  role: optionalText.default(null),
  tools: z.array(z.string().trim().min(1)).default([]),
  temperature: z.enum(["hot", "warm", "cool"]).nullable().default(null),
  contact: z.object({
    name: optionalText.default(null), job_title: optionalText.default(null),
    email: z.string().trim().email().nullable().default(null),
  }).default({ name: null, job_title: null, email: null }),
  visualisation_tool: optionalText.default(null),
  uses_3d: z.boolean().nullable().default(null),
  opportunity: optionalText.default(null),
  pain_points: z.array(z.string().trim().min(1)).default([]),
});
export const supplierUpdateSchema = z.object({
  name: supplierSchema.shape.name.optional(),
  role: supplierSchema.shape.role.removeDefault().optional(),
  tools: supplierSchema.shape.tools.removeDefault().optional(),
  temperature: supplierSchema.shape.temperature.removeDefault().optional(),
  contact: supplierSchema.shape.contact.removeDefault().optional(),
  visualisation_tool: supplierSchema.shape.visualisation_tool.removeDefault().optional(),
  uses_3d: supplierSchema.shape.uses_3d.removeDefault().optional(),
  opportunity: supplierSchema.shape.opportunity.removeDefault().optional(),
  pain_points: supplierSchema.shape.pain_points.removeDefault().optional(),
}).refine(data => Object.keys(data).length > 0, "No fields to update");
export const supplierIdParams = z.object({ id: z.string().uuid() });
export const supplierLinkParams = z.object({ id: z.string().uuid(), supplierId: z.string().uuid() });
export type Supplier = z.infer<typeof supplierSchema> & { id: string };
