import { z } from "zod/v4";
import { INDUSTRIES } from "../config/industries.ts";
import { currencySchema } from "../config/currencies.ts";

// Enrichment-driven text fields: blank strings mean "unknown" and become
// absent (create) or null (update) instead of failing validation.
const optionalEnrichmentText = z.preprocess(
  (value) => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? undefined : value),
  z.string().trim().min(1).max(100),
).optional();

const nullableEnrichmentText = z.preprocess(
  (value) => (value === undefined ? undefined : value === null || (typeof value === "string" && value.trim() === "") ? null : value),
  z.string().trim().min(1).max(100),
).nullable().optional();

export const createLeadSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Invalid email address"),
  company: z.string().optional(),
  job_title: z.string().optional(),
  phone: z.string().optional(),
  industry: z.enum(INDUSTRIES).optional(),
  region_group: optionalEnrichmentText,
  region: optionalEnrichmentText,
  state: optionalEnrichmentText,
  country: optionalEnrichmentText,
  project: optionalEnrichmentText,
  project_size: optionalEnrichmentText,
  project_value: z.coerce.number().min(0).nullable().optional(),
  currency: currencySchema.nullable().optional(),
  phase: z.enum(["Discovery", "Bid", "In-flight"]).optional(),
  lead_status: z.enum(["New", "Identified", "Bidding", "Inflight", "Closed"]).optional(),
  status: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
  applications: z.coerce.number().min(0).default(0),
  application_tools: z.array(z.string().min(1)).default([]),
  score: z.coerce.number().min(0).max(100).default(0),
  temperature: z.enum(["hot", "warm", "cool"]).optional(),
  assigned_to: z.coerce.number().int().positive().nullable().optional(),
  archived: z.coerce.boolean().default(false),
  send_confirmation_email: z.boolean().optional(),
});

export const updateLeadSchema = z.object({
  full_name: z.string().min(2).optional(),
  email: z.string().trim().email().optional(),
  company: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  industry: z.enum(INDUSTRIES).nullable().optional(),
  region_group: nullableEnrichmentText,
  region: nullableEnrichmentText,
  state: nullableEnrichmentText,
  country: nullableEnrichmentText,
  project: nullableEnrichmentText,
  project_size: nullableEnrichmentText,
  project_value: z.coerce.number().min(0).nullable().optional(),
  currency: currencySchema.nullable().optional(),
  phase: z.enum(["Discovery", "Bid", "In-flight"]).nullable().optional(),
  lead_status: z.enum(["New", "Identified", "Bidding", "Inflight", "Closed"]).nullable().optional(),
  applications: z.coerce.number().min(0).optional(),
  application_tools: z.array(z.string().min(1)).optional(),
  score: z.coerce.number().min(0).max(100).optional(),
  temperature: z.enum(["hot", "warm", "cool"]).optional(),
  status: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
  assigned_to: z.coerce.number().int().positive().nullable().optional(),
  archived: z.coerce.boolean().optional(),
});

export const assignLeadSchema = z.object({
  assigned_to: z.coerce.number().int().positive("Invalid user ID"),
});

export const leadIdParamSchema = z.object({
  id: z.string().uuid("Invalid lead ID"),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;
