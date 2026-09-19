import { expect, test, mock } from "bun:test";
import { startSequenceSchema, editSequenceStepSchema, completeSequenceStepSchema } from "../src/validations/sequence.validation.ts";
mock.module("../src/config/supabase.ts", () => ({ supabase: {} }));
mock.module("../src/config/env.config.ts", () => ({ env: { RESEND_API_KEY: "re_test", FROM_EMAIL: "sender@example.test" } }));
const { deliverSequenceJob } = await import("../src/services/sequence-worker.service.ts");
const input = { lead_id: "f88351d0-fecb-4d88-94d9-99a6fa9fe21b", steps: [
  { channel: "linkedin", message: "Hello" }, { channel: "email", subject: "Hello", message: "Day 3" },
  { channel: "email", subject: "Following up", message: "Day 7" }, { channel: "phone", message: "Call" },
] };
test("four-touch validation enforces channels and email subjects", () => {
  expect(startSequenceSchema.safeParse(input).success).toBe(true);
  expect(startSequenceSchema.safeParse({ ...input, steps: input.steps.slice(1) }).success).toBe(false);
  expect(startSequenceSchema.safeParse({ ...input, steps: input.steps.map((step, i) => i === 3 ? { channel: "linkedin", message: "Wrong channel" } : step) }).success).toBe(false);
  expect(startSequenceSchema.safeParse({ ...input, steps: input.steps.map((step, i) => i === 3 ? { channel: "email", message: "Missing subject" } : step) }).success).toBe(false);
});
test("edits cannot mutate statuses; activity time must be in the past", () => {
  expect(editSequenceStepSchema.safeParse({ status: "sent" }).success).toBe(false);
  expect(editSequenceStepSchema.safeParse({}).success).toBe(false);
  expect(editSequenceStepSchema.safeParse({ due_at: "2026-10-01T09:00:00+01:00" }).success).toBe(true);
  expect(completeSequenceStepSchema.safeParse({ completed_at: new Date(Date.now() + 60000).toISOString() }).success).toBe(false);
});
const job = () => ({ id: "step-id", sequence_id: "sequence-id", lease_token: "token", idempotency_key: "outreach-step/step-id", first_attempt_at: new Date().toISOString(), payload: { from: "sender@example.test", to: "lead@example.test", subject: "Hello", html: "Message" } });
test("provider acceptance is finalized with its ID and frozen idempotency key", async () => {
  const send = mock(async () => ({ success: true, message: "Sent", data: { id: "resend-id" } }));
  const rpc = mock(async () => null);
  await deliverSequenceJob(job(), { send, rpc });
  expect(send).toHaveBeenCalledWith({ ...job().payload, idempotencyKey: "outreach-step/step-id" });
  expect(rpc).toHaveBeenCalledWith("finish_outreach_email", { p_step_id: "step-id", p_token: "token", p_email_id: "resend-id", p_error: null });
});
test("logging failure leaves lease recovery responsible; does not issue a second send", async () => {
  const send = mock(async () => ({ success: true, message: "Sent", data: { id: "resend-id" } }));
  const rpc = mock(async () => { throw new Error("Database unavailable"); });
  await expect(deliverSequenceJob(job(), { send, rpc })).rejects.toThrow("Database unavailable");
  expect(send).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledTimes(1);
});
test("provider failures are persisted for database retry policy", async () => {
  const rpc = mock(async () => null);
  await deliverSequenceJob(job(), { send: async () => ({ success: false, message: "Failed", error: "Rate limit" }), rpc });
  expect(rpc).toHaveBeenCalledWith("finish_outreach_email", { p_step_id: "step-id", p_token: "token", p_email_id: null, p_error: "Rate limit" });
});
test("expired idempotency protection prevents any provider call", async () => {
  const send = mock(async () => ({ success: true, message: "Sent", data: { id: "resend-id" } }));
  await deliverSequenceJob({ ...job(), first_attempt_at: new Date(Date.now() - 24 * 3600000).toISOString() }, { send, rpc: async () => null });
  expect(send).not.toHaveBeenCalled();
});
test("a hung email request times out without overwriting its uncertain lease", async () => {
  const rpc = mock(async () => null);
  await expect(deliverSequenceJob(job(), { send: () => new Promise(() => {}), rpc }, 5)).rejects.toThrow("timed out");
  expect(rpc).not.toHaveBeenCalled();
});
