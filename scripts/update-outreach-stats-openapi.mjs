import { readFileSync, writeFileSync } from "node:fs";
const file = new URL("../openapi.json", import.meta.url);
const spec = JSON.parse(readFileSync(file, "utf8"));
const schemas = spec.components.schemas;
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const uuid = { type: "string", format: "uuid" };
const date = { type: "string", format: "date-time" };
const notes = { type: "string", maxLength: 10000 };
const count = { type: "integer", minimum: 0, nullable: true };
const channels = { type: "string", enum: ["linkedin", "email", "phone"] };
const statuses = { type: "string", enum: ["booked", "completed", "cancelled", "no_show"] };
schemas.OutreachStats = { type: "object", properties: {
  linkedin_sent: { ...count, description: "Completed LinkedIn sequence steps plus standalone manual send records by sent_at within the period. Stable activity IDs deduplicate retries." },
  response_rate: { type: "number", minimum: 0, maximum: 100, nullable: true, description: "100 * numerator / denominator, two decimal places; zero when tracked with no contacts." },
  response_rate_numerator: { ...count, description: "Distinct contacted leads with a recorded reply in the same period, at or after their first contact in that period." },
  response_rate_denominator: { ...count, description: "Distinct leads with a non-failed/non-bounced sent email or completed LinkedIn/phone touch in the period." },
  meetings_booked: { ...count, description: "Distinct meeting records by original booked_at, including later cancelled/no-show/completed bookings." },
  availability: { type: "object", properties: Object.fromEntries(["linkedin_sent", "response_rate", "meetings_booked"].map(key => [key, { type: "boolean" }])) },
  period: { type: "object", properties: { start: date, end: date, timezone: { type: "string", enum: ["UTC"] }, bounds: { type: "string", enum: ["rolling"] } } },
  sequence_schema_ready: { type: "boolean", nullable: true, description: "Sequence tables/RPCs are installed; null when stats schema is unavailable." },
  scheduler_enabled: { type: "boolean", description: "OUTREACH_SCHEDULER_ENABLED flag on the responding backend instance, not a worker-health guarantee." },
  unavailable_reason: { type: "string", nullable: true, description: "Null when all metrics are available; a migration-guidance phrase when a metric cannot be computed." },
} };
schemas.RecordOutreachReply = { type: "object", additionalProperties: false, required: ["id", "lead_id", "channel"], properties: {
  id: { ...uuid, description: "Client-generated stable ID. Reuse on retries." }, lead_id: uuid, channel: channels,
  replied_at: { ...date, description: "Defaults to now; cannot be future." }, notes,
} };
schemas.RecordOutreachMeeting = { type: "object", additionalProperties: false, required: ["id", "lead_id", "scheduled_at"], properties: {
  id: { ...uuid, description: "Client-generated stable ID. Reuse on retries and retain when rescheduling." }, lead_id: uuid,
  booked_at: { ...date, description: "Defaults to now; cannot be future. Immutable after creation." }, scheduled_at: date, notes,
} };
schemas.UpdateOutreachMeeting = { type: "object", additionalProperties: false, minProperties: 1, properties: {
  scheduled_at: date, status: statuses, outcome: { ...notes, nullable: true }, notes: { ...notes, nullable: true },
} };
schemas.OutreachReply = { type: "object", properties: { id: uuid, lead_id: uuid, channel: channels, replied_at: date, notes: { ...notes, nullable: true }, created_at: date } };
schemas.OutreachMeeting = { type: "object", properties: { id: uuid, lead_id: uuid, booked_at: date, scheduled_at: date, status: statuses, outcome: { ...notes, nullable: true }, notes: { ...notes, nullable: true }, created_at: date, updated_at: date } };
const operation = (summary, { input, data, created = false, parameters = [], description, write = false } = {}) => ({
  tags: ["Outreach"], summary, description, security: [{ bearerAuth: [] }], parameters,
  ...(input ? { requestBody: { required: true, content: { "application/json": { schema: ref(input) } } } } : {}),
  responses: {
    [created ? 201 : 200]: { description: "Success", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean", example: true }, data } } } } },
    400: { description: "Invalid input" }, 401: { description: "Authentication required" },
    ...(write ? { 403: { description: "Admin required" }, 404: { description: "Lead or meeting not found" }, 409: { description: "Conflicting activity ID or duplicate lead/meeting time" } } : {}),
    500: { description: "Database operation failed" },
  },
});
spec.paths["/api/outreach/stats"] = { get: operation("Aggregate Outreach card metrics for one reporting period", {
  data: ref("OutreachStats"), parameters: ["start", "end"].map(name => ({ name, in: "query", schema: date, description: "Provide both bounds or neither. Start inclusive, end exclusive; default trailing 30 days." })),
  description: "Authenticated read. Completed LinkedIn steps count as sent. Response rate uses distinct contacted leads with manual replies in the same period after contact. Meetings count original bookings, including later cancellations. Unavailable metrics are null; installed tracking with no activity is zero. Missing stats schema returns 200 with null metrics and migration guidance. Unexpected failures remain errors.",
}) };
const pagination = { type: "object", properties: Object.fromEntries(["page", "limit", "total", "pages"].map(key => [key, { type: "integer" }])) };
for (const [kind, singular] of [["replies", "Reply"], ["meetings", "Meeting"]]) {
  const list = operation(`List a lead's Outreach ${kind}`, { parameters: [
    { name: "lead_id", in: "query", required: true, schema: uuid },
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  ], data: { type: "object", properties: { [kind]: { type: "array", items: ref(`Outreach${singular}`) }, pagination } } });
  const create = operation(`Record an Outreach ${singular.toLowerCase()}`, { input: `RecordOutreach${singular}`, data: ref(`Outreach${singular}`), created: true, write: true,
    description: kind === "replies" ? "Manual reply detection. Stable IDs deduplicate retries. A new reply pauses an active sequence if the reply occurred after its start; replays do not pause again." : "Stable meeting IDs deduplicate retries and preserve later edits. Lead plus scheduled_at is also unique. Booked_at does not change when rescheduled." });
  for (const endpoint of [list, create]) endpoint.responses[503] = { description: "Apply scripts/outreach-activity-migration.sql to enable tracking." };
  spec.paths[`/api/outreach/${kind}`] = { get: list, post: create };
}
const patch = operation("Reschedule a meeting or update its outcome", { input: "UpdateOutreachMeeting", data: ref("OutreachMeeting"), write: true,
  parameters: [{ name: "meetingId", in: "path", required: true, schema: uuid }], description: "Admin required. Meeting ID, lead and original booking time are immutable. Outcomes and rescheduling do not create additional bookings." });
patch.responses[503] = { description: "Apply scripts/outreach-activity-migration.sql to enable tracking." };
spec.paths["/api/outreach/meetings/{meetingId}"] = { patch };
schemas.RecordOutreachLinkedinSend = { type: "object", additionalProperties: false, required: ["id", "lead_id", "message", "sent_at"], properties: {
  id: { ...uuid, description: "Stable client activity ID; reuse the same ID and payload on retries." }, lead_id: uuid,
  message: { type: "string", minLength: 1, maxLength: 10000, description: "Exact message text. Whitespace-only text is invalid; no trimming or escaping is applied." },
  sent_at: { ...date, description: "Required, cannot be future." },
} };
schemas.OutreachLinkedinSend = { type: "object", properties: { ...schemas.RecordOutreachLinkedinSend.properties, recorded_by: { ...uuid, readOnly: true }, created_at: { ...date, readOnly: true } } };
spec.paths["/api/outreach/linkedin-sends"] = {
  post: operation("Record a standalone manual LinkedIn send", { input: "RecordOutreachLinkedinSend", data: ref("OutreachLinkedinSend"), created: true, write: true,
    description: "Admin required. Actor comes from authenticated token. Creates no sequence and sends no message. Identical retry returns original record with 201; changed payload or actor for the same ID returns 409. Do not also complete a sequence step for the same real-world send." }),
  get: operation("List standalone LinkedIn sends for a lead", { parameters: [
    { name: "lead_id", in: "query", required: true, schema: uuid },
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  ], data: { type: "object", properties: { linkedin_sends: { type: "array", items: ref("OutreachLinkedinSend") }, pagination } } }),
};
for (const method of ["get", "post"]) spec.paths["/api/outreach/linkedin-sends"][method].responses[503] = { description: "Tracking migration unavailable; apply scripts/outreach-linkedin-sends-migration.sql." };
spec.paths["/api/outreach/stats"].get.description += " Standalone manual LinkedIn sends also contribute to linkedin_sent and distinct contacted leads after the LinkedIn activity migration.";
writeFileSync(file, JSON.stringify(spec, null, 2) + "\n");
