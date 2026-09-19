import { z } from "zod/v4";

export const outreachPreviewSchema = z.object({
  lead_id: z.string().uuid(),
  subject: z.string().min(1),
  template: z.string().min(1),
});

export const outreachSendSchema = outreachPreviewSchema.extend({ campaign_id: z.string().uuid().nullable().optional() });
