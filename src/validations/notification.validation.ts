import { z } from "zod/v4";

export const createNotificationSchema = z.object({
  user_id: z.string().min(1, "Invalid user ID"),
  title: z.string().min(1, "Title is required"),
  message: z.string().min(1, "Message is required"),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid("Invalid notification ID"),
});

export type CreateNotificationInput = z.infer<
  typeof createNotificationSchema
>;
