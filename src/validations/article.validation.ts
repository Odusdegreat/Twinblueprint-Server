import { z } from "zod";

export const articleQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  category: z.string().optional(),
  status: z.enum(['published', 'draft']).optional(),
  search: z.string().optional(),
});

export const articleParamsSchema = z.object({
  slug: z.string().min(1),
});

export type ArticleQueryParams = z.infer<typeof articleQuerySchema>;
export type ArticleParams = z.infer<typeof articleParamsSchema>;