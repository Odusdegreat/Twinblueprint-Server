import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import express from "express";
import jwt from "jsonwebtoken";
import { outreachPeriodSchema, recordReplySchema, recordMeetingSchema, updateMeetingSchema } from "../src/validations/outreach-activity.validation.ts";
import { recordLinkedinSendSchema } from "../src/validations/outreach-activity.validation.ts";
import { sanitizeInput } from "../src/middleware/security.ts";

let result: { data: any; error: any };
const rpc = mock(() => ({ abortSignal: async () => result }));
const query: any = { select: mock(() => query), eq: mock(() => query), order: mock(() => query), range: mock(async () => ({ data: [], count: 0, error: null })) };
const from = mock(() => query);
mock.module("../src/config/supabase.ts", () => ({ supabase: { rpc, from } }));
mock.module("../src/config/env.config.ts", () => ({ env: { JWT_SECRET: "activity-test-secret", RESEND_API_KEY: "re_test", FROM_EMAIL: "sender@example.test" } }));
const service = await import("../src/services/outreach-activity.service.ts");
const { default: router } = await import("../src/routes/outreach.routes.ts");
import { errorHandler } from "../src/middleware/errorHandler.ts";
const app = express(); app.use(express.json()); app.use(sanitizeInput); app.use("/api/outreach", router); app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.on("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/outreach`;
const log = spyOn(console, "error").mockImplementation(() => {});
afterAll(() => { server.close(); log.mockRestore(); });
beforeEach(() => { rpc.mockClear(); result = { data: { linkedin_sent: 0, response_rate: 0, meetings_booked: 0, response_rate_numerator: 0, response_rate_denominator: 0, availability: { linkedin_sent: true, response_rate: true, meetings_booked: true }, sequence_schema_ready: true }, error: null }; });
const id = "f88351d0-fecb-4d88-94d9-99a6fa9fe21b";
const auth = (role: string) => ({ authorization: `Bearer ${jwt.sign({ sub: "1", role }, "activity-test-secret")}` });

test("all cards share a default 30-day UTC period", async () => {
  const data = await service.getOutreachStats({});
  expect(Date.parse(data.period.end) - Date.parse(data.period.start)).toBe(30 * 86400000);
  expect(data.period.bounds).toBe("rolling");
  expect(data.unavailable_reason).toBe(null);
  expect(data.linkedin_sent).toBe(0); expect(data.response_rate).toBe(0); expect(data.meetings_booked).toBe(0);
});
test("custom periods normalize timezone offsets without changing their instants", async () => {
  const data = await service.getOutreachStats({ start: "2026-01-01T01:00:00+01:00", end: "2026-02-01T01:00:00+01:00" });
  expect(data.period.start).toBe("2026-01-01T00:00:00.000Z");
  expect(rpc).toHaveBeenCalledWith("get_outreach_stats", { p_start: data.period.start, p_end: data.period.end });
});
test("uninstalled stats return null metrics instead of fabricated zero activity", async () => {
  result = { data: null, error: { code: "PGRST202", message: "Function missing" } };
  const data = await service.getOutreachStats({});
  expect([data.linkedin_sent, data.response_rate, data.meetings_booked, data.response_rate_numerator, data.response_rate_denominator]).toEqual([null, null, null, null, null]);
  expect(data.availability.response_rate).toBe(false);
  expect(data.unavailable_reason).toContain("outreach-activity-migration.sql");
});
test("unavailable metrics carry a per-metric reason while tracked metrics stay trustable", async () => {
  result.data = { linkedin_sent: 3, response_rate: 50, meetings_booked: null, response_rate_numerator: 1, response_rate_denominator: 2, availability: { linkedin_sent: true, response_rate: true, meetings_booked: false }, sequence_schema_ready: true };
  const data = await service.getOutreachStats({});
  expect(data.meetings_booked).toBe(null);
  expect(data.availability.meetings_booked).toBe(false);
  expect(data.linkedin_sent).toBe(3);
  expect(data.unavailable_reason).toContain("outreach-activity-migration.sql");
});
test("database permission errors fail instead of becoming empty metrics", async () => {
  result.error = { code: "42501", message: "Permission denied" };
  await expect(service.getOutreachStats({})).rejects.toMatchObject({ statusCode: 500 });
});
test("activity recording forwards a stable ID and gives migration guidance when unavailable", async () => {
  await service.recordOutreachActivity("reply", { id, lead_id: id, channel: "email" });
  expect(rpc).toHaveBeenCalledWith("record_outreach_reply", { p_input: { id, lead_id: id, channel: "email" } });
  result.error = { code: "PGRST202", message: "Function missing" };
  await expect(service.recordOutreachActivity("meeting", {})).rejects.toMatchObject({ statusCode: 503 });
});
test("period validation requires ordered start/end pairs", () => {
  expect(outreachPeriodSchema.safeParse({}).success).toBe(true);
  expect(outreachPeriodSchema.safeParse({ start: "2026-01-01T00:00:00Z" }).success).toBe(false);
  expect(outreachPeriodSchema.safeParse({ start: "2026-02-01T00:00:00Z", end: "2026-01-01T00:00:00Z" }).success).toBe(false);
});
test("activity validation requires IDs and prevents future replies and booking times", () => {
  expect(recordReplySchema.safeParse({ lead_id: id, channel: "email" }).success).toBe(false);
  expect(recordReplySchema.safeParse({ id, lead_id: id, channel: "email", replied_at: new Date(Date.now() + 60000).toISOString() }).success).toBe(false);
  expect(recordMeetingSchema.safeParse({ id, lead_id: id, scheduled_at: "2027-01-01T09:00:00Z" }).success).toBe(true);
  expect(recordMeetingSchema.safeParse({ id, lead_id: id, scheduled_at: "2027-01-01T09:00:00Z", booked_at: new Date(Date.now() + 60000).toISOString() }).success).toBe(false);
  expect(updateMeetingSchema.safeParse({ booked_at: "2026-01-01T00:00:00Z" }).success).toBe(false);
  expect(updateMeetingSchema.safeParse({ lead_id: id }).success).toBe(false);
  expect(updateMeetingSchema.safeParse({ status: "completed", outcome: "Demo went well" }).success).toBe(true);
});
test("stats requires authentication and validates query before contacting storage", async () => {
  expect((await fetch(`${base}/stats`)).status).toBe(401);
  expect((await fetch(`${base}/stats?start=bad`, { headers: auth("user") })).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  expect((await fetch(`${base}/stats`, { headers: auth("user") })).status).toBe(200);
});
test("reply and meeting writes require admin; valid recording uses the persistence endpoint", async () => {
  for (const path of ["replies", "meetings"]) {
    expect((await fetch(`${base}/${path}`, { method: "POST", headers: auth("user") })).status).toBe(403);
  }
  expect(rpc).not.toHaveBeenCalled();
  expect((await fetch(`${base}/replies`, { method: "POST", headers: { ...auth("admin"), "content-type": "application/json" }, body: JSON.stringify({ id, lead_id: id, channel: "linkedin" }) })).status).toBe(201);
});

const linkedinInput = { id, lead_id: id, message: "  Hi <Sam> & \"team\"!\nExact text.  ", sent_at: "2026-01-05T12:00:00Z" };
test("manual LinkedIn validation preserves text and rejects invalid or spoofed fields", () => {
  expect(recordLinkedinSendSchema.parse(linkedinInput).message).toBe(linkedinInput.message);
  for (const patch of [{ id: "invalid" }, { lead_id: "invalid" }, { message: " \n " }, { message: "x".repeat(10001) }, { sent_at: undefined }, { sent_at: new Date(Date.now()+60000).toISOString() }, { recorded_by: id }, { sequence_id: id }]) {
    expect(recordLinkedinSendSchema.safeParse({ ...linkedinInput, ...patch }).success).toBe(false);
  }
});
test("manual LinkedIn recording requires admin and uses authenticated identity and exact text", async () => {
  const send = (headers = {}, input = linkedinInput) => fetch(`${base}/linkedin-sends`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(input) });
  expect((await send()).status).toBe(401);
  expect((await send(auth("user"))).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  expect((await send(auth("admin"))).status).toBe(201);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("record_outreach_linkedin_send", { p_input: { ...linkedinInput, recorded_by: "1" } });
});
test("manual LinkedIn conflicts, missing leads, and unavailable migrations map to HTTP errors", async () => {
  for (const [code, statusCode] of [["23505",409],["23503",404],["22023",400],["PGRST202",503]] as const) {
    result.error = { code, message: "Storage error" };
    await expect(service.recordOutreachActivity("linkedin_send", linkedinInput)).rejects.toMatchObject({ statusCode });
  }
});
test("manual LinkedIn retrieval requires authentication and filters and paginates by lead", async () => {
  expect((await fetch(`${base}/linkedin-sends?lead_id=${id}`)).status).toBe(401);
  expect((await fetch(`${base}/linkedin-sends?lead_id=bad`, { headers: auth("admin") })).status).toBe(400);
  const response = await fetch(`${base}/linkedin-sends?lead_id=${id}&page=2&limit=5`, { headers: auth("user") });
  expect(response.status).toBe(200);
  expect(from).toHaveBeenCalledWith("outreach_linkedin_sends");
  expect(query.eq).toHaveBeenCalledWith("lead_id", id);
  expect(query.range).toHaveBeenCalledWith(5,9);
  expect(await response.json()).toMatchObject({ success: true, data: { linkedin_sends: [], pagination: { page: 2, limit: 5, total: 0 } } });
});
