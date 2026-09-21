import { z } from "zod/v4";

const timestamp = z.iso.datetime({ offset: true });
const pastTimestamp = timestamp.refine(value => Date.parse(value) <= Date.now(), "Time cannot be in the future");
const notes = z.string().max(10000);
export const recordLinkedinSendSchema = z.object({
  id: z.uuid(), lead_id: z.uuid(),
  message: z.string().max(10000).refine(value => value.trim().length > 0, "Message is required"),
  sent_at: pastTimestamp,
}).strict();
export const outreachPeriodSchema = z.object({ start: timestamp.optional(), end: timestamp.optional() }).strict()
  .refine(value => !!value.start === !!value.end, "Provide both start and end, or omit both")
  .refine(value => !value.start || Date.parse(value.start) < Date.parse(value.end!), "End must be after start");
export const recordReplySchema = z.object({
  id: z.uuid(), lead_id: z.uuid(), channel: z.enum(["linkedin", "email", "phone"]), replied_at: pastTimestamp.optional(), notes: notes.optional(),
}).strict();
export const recordMeetingSchema = z.object({
  id: z.uuid(), lead_id: z.uuid(), scheduled_at: timestamp, booked_at: pastTimestamp.optional(), notes: notes.optional(),
}).strict();
export const updateMeetingSchema = z.object({
  scheduled_at: timestamp.optional(), status: z.enum(["booked", "completed", "cancelled", "no_show"]).optional(),
  outcome: z.string().max(10000).nullable().optional(), notes: notes.nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Provide at least one field");
export const meetingParamsSchema = z.object({ meetingId: z.uuid() });
export const outreachActivityListSchema = z.object({ lead_id: z.uuid(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
