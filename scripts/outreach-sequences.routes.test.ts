import { afterAll, expect, mock, test } from "bun:test";
import express from "express";
import jwt from "jsonwebtoken";
import { errorHandler } from "../src/middleware/errorHandler.ts";
mock.module("../src/config/env.config.ts", () => ({ env: { JWT_SECRET: "test-sequence-secret", RESEND_API_KEY: "re_test", FROM_EMAIL: "sender@example.test" } }));
mock.module("../src/config/supabase.ts", () => ({ supabase: {} }));
const change = mock(async () => ({ id: "sequence", status: "paused" }));
const start = mock(async () => ({ id: "sequence", status: "active" }));
mock.module("../src/services/sequence.service.ts", () => ({ startSequence: start, getSequence: async (id: string) => ({ id, steps: [] }), listSequences: async () => ({ sequences: [] }), changeSequence: change }));
const { default: router } = await import("../src/routes/outreach.routes.ts");
const app = express();
app.use(express.json()); app.use("/api/outreach", router); app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.on("listening", resolve));
const address = server.address() as { port: number };
const base = `http://127.0.0.1:${address.port}/api/outreach/sequences`;
const id = "f88351d0-fecb-4d88-94d9-99a6fa9fe21b";
const auth = (role: string) => ({ authorization: `Bearer ${jwt.sign({ sub: "1", role }, "test-sequence-secret")}` });
afterAll(() => server.close());
test("sequence routes require authentication", async () => {
  expect((await fetch(`${base}/${id}`)).status).toBe(401);
});
test("readers can retrieve progress but cannot mutate sequences", async () => {
  expect((await fetch(`${base}/${id}`, { headers: auth("user") })).status).toBe(200);
  expect((await fetch(`${base}/${id}/pause`, { method: "POST", headers: auth("user") })).status).toBe(403);
  expect(change).not.toHaveBeenCalled();
});
test("bad path and query identifiers return 400", async () => {
  expect((await fetch(`${base}/bad-id`, { headers: auth("admin") })).status).toBe(400);
  expect((await fetch(base, { headers: auth("admin") })).status).toBe(400);
});
test("admin pause accepts an empty body", async () => {
  expect((await fetch(`${base}/${id}/pause`, { method: "POST", headers: auth("admin") })).status).toBe(200);
  expect(change).toHaveBeenCalledWith(id, "pause", { reason: "manual" });
});
test("invalid start cannot reach persistence", async () => {
  expect((await fetch(base, { method: "POST", headers: { ...auth("admin"), "content-type": "application/json" }, body: JSON.stringify({ lead_id: id, steps: [] }) })).status).toBe(400);
  expect(start).not.toHaveBeenCalled();
});
