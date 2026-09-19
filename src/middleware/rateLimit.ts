import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { readRateLimitConfig } from "../config/rate-limit.config.ts";

export function createApiLimiters(config = readRateLimitConfig()) {
  const isRead = (req: Request) => req.method === "GET" || req.method === "HEAD";
  // Paths are relative to the /api mount. Health probes must not consume CRM quota.
  const exempt = (req: Request) => req.method === "OPTIONS" ||
    (isRead(req) && /^\/health\/?$/i.test(req.path));
  const common = {
    windowMs: config.windowMs,
    standardHeaders: "draft-6" as const,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, try again later" },
  };
  // Separate stores prevent writes and reads from exhausting each other's budget.
  // Keep the library's IP key generator, including its IPv6 subnet protection.
  return [
    rateLimit({ ...common, limit: config.readLimit, skip: (req) => exempt(req) || !isRead(req) }),
    rateLimit({ ...common, limit: config.writeLimit, skip: (req) => exempt(req) || isRead(req) }),
  ];
}
