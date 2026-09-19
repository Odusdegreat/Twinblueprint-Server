import { readFileSync, writeFileSync } from "node:fs";
const file = new URL("../openapi.json", import.meta.url);
const spec = JSON.parse(readFileSync(file, "utf8"));
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const uuid = { type: "string", format: "uuid" };
const date = { type: "string", format: "date-time" };
const text = { type: "string" };
const schemas = spec.components.schemas;
schemas.OutreachSequenceStepInput = { type: "object", additionalProperties: false, required: ["channel", "message"], properties: {
  channel: { type: "string", enum: ["linkedin", "email", "phone"] }, message: { type: "string", minLength: 1, maxLength: 100000 }, subject: { type: "string", minLength: 1, maxLength: 998 },
} };
schemas.StartOutreachSequence = { type: "object", additionalProperties: false, required: ["lead_id", "steps"], properties: {
  lead_id: uuid, start_at: { ...date, description: "Defaults to now. Timezone required." }, steps: { type: "array", minItems: 4, maxItems: 4, items: ref("OutreachSequenceStepInput"), description: "In order: LinkedIn day 0, email day 3, email day 7, phone or email day 14. Email requires subject. Messages are personalized at creation." },
} };
schemas.EditOutreachSequenceStep = { type: "object", additionalProperties: false, minProperties: 1, properties: { due_at: date, message: { type: "string", minLength: 1, maxLength: 100000 }, subject: { type: "string", minLength: 1, maxLength: 998 } } };
schemas.OutreachSequenceActivity = { type: "object", additionalProperties: false, properties: { completed_at: { ...date, description: "Defaults to now; cannot be in the future." }, notes: { type: "string", maxLength: 10000 } } };
schemas.OutreachSequenceControl = { type: "object", additionalProperties: false, properties: { reason: { type: "string", enum: ["manual", "reply", "deal_outcome"], default: "manual" }, notes: { type: "string", maxLength: 10000 } } };
schemas.OutreachSequenceAttempt = { type: "object", properties: { id: uuid, step_id: uuid, attempt: { type: "integer" }, lease_token: uuid, status: { type: "string", enum: ["sending", "sent", "failed", "unknown"] }, started_at: date, finished_at: { ...date, nullable: true }, error: { ...text, nullable: true }, resend_email_id: { ...text, nullable: true } } };
schemas.OutreachSequenceStep = { type: "object", properties: {
  id: uuid, sequence_id: uuid, position: { type: "integer", minimum: 1, maximum: 4 }, channel: { type: "string", enum: ["linkedin", "email", "phone"] },
  due_at: date, message: text, subject: { ...text, nullable: true }, status: { type: "string", enum: ["pending", "scheduled", "sent", "completed", "failed", "skipped"] },
  completed_at: { ...date, nullable: true }, notes: { ...text, nullable: true }, email_log_id: { ...uuid, nullable: true }, sent_email: { allOf: [ref("EmailLog")], nullable: true },
  attempt_count: { type: "integer" }, first_attempt_at: { ...date, nullable: true }, next_attempt_at: { ...date, nullable: true }, last_error: { ...text, nullable: true },
  lease_token: { ...uuid, nullable: true }, lease_until: { ...date, nullable: true }, payload: { type: "object", nullable: true, additionalProperties: true },
  created_at: date, updated_at: date, attempts: { type: "array", items: ref("OutreachSequenceAttempt") },
} };
schemas.OutreachSequence = { type: "object", properties: { id: uuid, lead_id: uuid, status: { type: "string", enum: ["active", "paused", "cancelled", "completed"] }, start_at: date,
  pause_reason: { ...text, nullable: true }, notes: { ...text, nullable: true }, created_at: date, updated_at: date,
  steps: { type: "array", items: ref("OutreachSequenceStep"), description: "Included in detail and mutation responses, ordered by position." },
} };
const parameter = name => ({ name, in: "path", required: true, schema: uuid });
const operation = (summary, { parameters = [], input, data = ref("OutreachSequence"), created = false, optionalBody = false, read = false, description } = {}) => ({
  tags: ["Outreach"], summary, description: description ?? (read ? "Requires authentication." : "Requires admin. Conflicting/finished steps return 409."), security: [{ bearerAuth: [] }], parameters,
  ...(input ? { requestBody: { required: !optionalBody, content: { "application/json": { schema: ref(input) } } } } : {}),
  responses: {
    [created ? "201" : "200"]: { description: "Success", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean", example: true }, data } } } } },
    400: { description: "Invalid input" }, 401: { description: "Authentication required" }, ...(!read ? { 403: { description: "Admin required" } } : {}),
    404: { description: "Sequence or step not found" }, 409: { description: "Conflicting state or active sequence already exists" }, 500: { description: "Database operation failed" },
    503: { description: "Sequence schema is missing or incomplete. Apply the outreach sequence migration and reload the Supabase schema cache." },
  },
});
const base = "/api/outreach/sequences";
spec.paths[base] = {
  post: operation("Start a persistent four-touch sequence", { input: "StartOutreachSequence", created: true }),
  get: operation("List a lead's sequences", { read: true, parameters: [
    { name: "lead_id", in: "query", required: true, schema: uuid },
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  ], data: { type: "object", properties: { sequences: { type: "array", items: ref("OutreachSequence") }, pagination: { type: "object", properties: Object.fromEntries(["page", "limit", "total", "pages"].map(key => [key, { type: "integer" }])) } } } }),
};
const parameters = [parameter("sequenceId")];
spec.paths[`${base}/{sequenceId}`] = { get: operation("Retrieve sequence progress and linked email records", { read: true, parameters }) };
for (const action of ["pause", "resume", "cancel"]) spec.paths[`${base}/{sequenceId}/${action}`] = { post: operation(`${action[0].toUpperCase()}${action.slice(1)} sequence`, { parameters, input: "OutreachSequenceControl", optionalBody: true }) };
const stepParameters = [...parameters, parameter("stepId")];
spec.paths[`${base}/{sequenceId}/steps/{stepId}`] = { patch: operation("Edit or reschedule an unattempted step", { parameters: stepParameters, input: "EditOutreachSequenceStep" }) };
for (const action of ["complete", "skip"]) spec.paths[`${base}/{sequenceId}/steps/{stepId}/${action}`] = { post: operation(action === "complete" ? "Record manual LinkedIn or phone completion" : "Skip an unfinished step", { parameters: stepParameters, input: "OutreachSequenceActivity", optionalBody: true }) };
writeFileSync(file, JSON.stringify(spec, null, 2) + "\n");
