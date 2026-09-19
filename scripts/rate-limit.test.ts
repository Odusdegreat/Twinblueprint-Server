import { afterEach, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { readRateLimitConfig } from "../src/config/rate-limit.config.ts";
import { createApiLimiters } from "../src/middleware/rateLimit.ts";

const servers: Server[] = [];
afterEach(() => { for (const server of servers.splice(0)) { server.closeAllConnections(); server.close(); } });
async function fixture(overrides: Partial<ReturnType<typeof readRateLimitConfig>> = {}) {
  const config = { ...readRateLimitConfig({}), trustProxyHops: 1, ...overrides };
  const app = express();
  app.set("trust proxy", config.trustProxyHops);
  app.use("/api", ...createApiLimiters(config));
  app.use((_req, res) => res.json({ success: true }));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  return async (path = "/api/leads", method = "GET", ip = "198.51.100.10") => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "X-Forwarded-For": ip } });
    await response.text();
    return response;
  };
}

test("CRM page bursts exceed the old 100 request budget without being blocked", async () => {
  const request = await fixture();
  const paths = ["/api/leads/options", "/api/leads/export?archived=false", "/api/leads?page=1&limit=20&archived=false", "/api/leads?page=1&limit=100&archived=false", "/api/regions"];
  for (let i = 0; i < 125; i++) expect((await request(paths[i % paths.length])).status).toBe(200);
});

test("budgets enforce limits, separate writes and clients, and exempt probes", async () => {
  const request = await fixture({ readLimit: 2, writeLimit: 1 });
  for (let i = 0; i < 3; i++) {
    expect((await request("/api/health")).status).toBe(200);
    expect((await request("/api/leads", "OPTIONS")).status).toBe(200);
    expect((await request("/other")).status).toBe(200);
  }
  expect((await request()).status).toBe(200);
  expect((await request()).status).toBe(200);
  const blocked = await request();
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect(Number(blocked.headers.get("RateLimit-Reset"))).toBeLessThanOrEqual(60);
  expect((await request("/api/leads", "GET", "198.51.100.11")).status).toBe(200);
  // Forging the leftmost header cannot evade a one-hop trust policy.
  expect((await request("/api/leads", "GET", "203.0.113.5, 198.51.100.10")).status).toBe(429);
  expect((await request("/api/leads", "POST")).status).toBe(200);
  expect((await request("/api/leads", "POST")).status).toBe(429);
});

test("quota recovers after the configured window", async () => {
  const request = await fixture({ readLimit: 1, windowMs: 100 });
  expect((await request()).status).toBe(200);
  expect((await request()).status).toBe(429);
  await Bun.sleep(160);
  expect((await request()).status).toBe(200);
});

test("configuration validates bounds and trusts only configured hops", () => {
  expect(readRateLimitConfig({}).trustProxyHops).toBe(0);
  expect(readRateLimitConfig({ RENDER: "true" }).trustProxyHops).toBe(1);
  expect(readRateLimitConfig({ RENDER: "true", TRUST_PROXY_HOPS: "0" }).trustProxyHops).toBe(0);
  for (const value of ["", "0", "-1", "NaN", "1.5", "2147483648"]) {
    expect(() => readRateLimitConfig({ API_RATE_LIMIT_WINDOW_MS: value })).toThrow();
  }
  expect(() => readRateLimitConfig({ TRUST_PROXY_HOPS: "true" })).toThrow();
});
