import { z } from "zod/v4";

const message = z.string().trim().min(1).max(100000);
const subject = z.string().trim().min(1).max(998);
const date = z.iso.datetime({ offset: true });
const step = z.object({ channel: z.enum(["linkedin", "email", "phone"]), message, subject: subject.optional() }).strict();
export const startSequenceSchema = z.object({
  lead_id: z.uuid(),
  start_at: date.optional(),
  steps: z.tuple([
    step.extend({ channel: z.literal("linkedin") }),
    step.extend({ channel: z.literal("email"), subject }),
    step.extend({ channel: z.literal("email"), subject }),
    step.refine(value => value.channel === "phone" || (value.channel === "email" && !!value.subject), "Last step must be phone or email (with a subject)"),
  ]),
}).strict();
export const editSequenceStepSchema = z.object({ due_at: date.optional(), message: message.optional(), subject: subject.optional() })
  .strict().refine(value => Object.keys(value).length > 0, "Provide at least one field");
export const completeSequenceStepSchema = z.object({ completed_at: date.refine(value => Date.parse(value) <= Date.now(), "Completion time cannot be in the future").optional(), notes: z.string().max(10000).optional() }).strict().default({});
export const sequenceControlSchema = z.object({ reason: z.enum(["manual", "reply", "deal_outcome"]).default("manual"), notes: z.string().max(10000).optional() }).strict().default({ reason: "manual" });
export const sequenceParamsSchema = z.object({ sequenceId: z.uuid() });
export const sequenceStepParamsSchema = sequenceParamsSchema.extend({ stepId: z.uuid() });
export const sequenceListSchema = z.object({ lead_id: z.uuid(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
