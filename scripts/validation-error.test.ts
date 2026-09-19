import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import express from "express";
import { z } from "zod/v4";
import { errorHandler } from "../src/middleware/errorHandler.ts";
import { validate } from "../src/middleware/validate.ts";

const status = mock();
const sendMock = mock();
const res: any = { status: (...args: any[]) => { status(...args); return { json: sendMock }; } };
const next = (() => {}) as any;
const error = (message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), extra);
beforeEach(() => { status.mockClear(); sendMock.mockClear(); });
afterEach(() => { status.mockRestore(); sendMock.mockRestore(); });

test("global handler shapes a ZodError as a 400 VALIDATION_ERROR with mapped field copy", () => {
  errorHandler(new z.ZodError([{ message: "Invalid input: expected string, received undefined", path: ["currency"], code: "invalid_type" }]) as any, {} as any, res, (() => {}) as any);
  expect(status).toHaveBeenCalledWith(400);
  expect(sendMock).toHaveBeenCalledWith({
    error: "VALIDATION_ERROR",
    message: "Please check the highlighted fields.",
    fields: [{ path: "currency", message: "Currency is required" }],
  });
});

test("unmapped field paths fall back to a generic message", () => {
  const fallback = new z.ZodError([{ message: "invalid", path: ["supplierId"], code: "invalid_type" }]);
  errorHandler(fallback as any, {} as any, res, (() => {}) as any);
  expect(sendMock).toHaveBeenCalledWith({
    error: "VALIDATION_ERROR",
    message: "Please check the highlighted fields.",
    fields: [{ path: "supplierId", message: "This field is invalid." }],
  });
});

test("internal failures never leak their message, details, or stack", () => {
  errorHandler(error("column bids.currency does not exist: 42703"), {} as any, res, next);
  expect(status).toHaveBeenCalledWith(500);
  expect(sendMock).toHaveBeenCalledWith({ success: false, message: "Internal server error" });
});

test("5xx errors with wrapped provider messages stay generic", () => {
  errorHandler(error("[451]: Resend rate limit 429 provider_detail=secret"), {} as any, res, next);
  expect(sendMock).toHaveBeenCalledWith({ success: false, message: "Internal server error" });
});

test("hand-authored 4xx client errors keep their safe message", () => {
  errorHandler(error("Project not found", { statusCode: 404 }), {} as any, res, next);
  expect(status).toHaveBeenCalledWith(404);
  expect(sendMock).toHaveBeenCalledWith({ success: false, message: "Project not found" });
});

test("invalid status codes fall back to a 500", () => {
  errorHandler(error("bad"), {} as any, res, next);
  expect(status).toHaveBeenCalledWith(500);
});

test("validate middleware forwards every failed source through the global handler", async () => {
  const app = express();
  app.use(express.json());
  app.post("/demo", validate(z.object({ name: z.string().min(2), note: z.string() })));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const response = await fetch(`${base}/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "VALIDATION_ERROR",
      message: "Please check the highlighted fields.",
      fields: [{ path: "name", message: "Name is required" }, { path: "note", message: "This field is invalid." }],
    });
  } finally {
    server.close();
  }
});