import { z } from "zod/v4";

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  type: z.enum(["LinkedIn", "Email"]),
  sent: z.number().min(0).default(0),
  opened: z.number().min(0).default(0),
  clicked: z.number().min(0).default(0),
  status: z.enum(["Completed", "Active"]).default("Active"),
  campaign_date: z.string().min(1, "Date is required"),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["LinkedIn", "Email"]).optional(),
  sent: z.number().min(0).optional(),
  opened: z.number().min(0).optional(),
  clicked: z.number().min(0).optional(),
  status: z.enum(["Completed", "Active"]).optional(),
  campaign_date: z.string().min(1).optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
