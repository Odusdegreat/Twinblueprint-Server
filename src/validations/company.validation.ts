import { z } from "zod/v4";

export const createCompanySchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  address: z.string().optional(),
});

export const updateCompanySchema = z.object({
  company_name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  industry: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const companyIdParamSchema = z.object({
  id: z.string().uuid("Invalid company ID"),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
