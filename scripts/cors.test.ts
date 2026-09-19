import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";

// Isolate from deployment secrets; these checks never query external services.
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
process.env.SUPABASE_SECRET_KEY = "test-key";
process.env.JWT_SECRET = "test-secret-for-cors-checks-only-32-chars";
process.env.FROM_EMAIL = "test@example.com";
process.env.CLIENT_URLS = "https://approved.example, http://localhost:3000";
process.env.API_RATE_LIMIT_READ_MAX = "2";
process.env.API_RATE_LIMIT_WRITE_MAX = "10";

const origin = "https://twinblueprint.vercel.app";
let server: Server;
let base: string;
beforeAll(async () => {
  const { default: app } = await import("../src/app.ts");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => { server?.closeAllConnections(); server?.close(); });

function checkCors(response: Response, expectedOrigin = origin) {
  expect(response.headers.get("access-control-allow-origin")).toBe(expectedOrigin);
  expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  expect(response.headers.get("vary")).toContain("Origin");
}

test("production origin works for industries, auth errors, and rate-limit errors", async () => {
  const industries = await fetch(`${base}/api/industries`, { headers: { Origin: origin } });
  expect(industries.status).toBe(200);
  checkCors(industries);
  expect((await industries.json()).data.industries.length).toBeGreaterThan(0);
  const unauthorized = await fetch(`${base}/api/auth/me`, { headers: { Origin: origin } });
  expect(unauthorized.status).toBe(401);
  checkCors(unauthorized);
  const limited = await fetch(`${base}/api/industries`, { headers: { Origin: origin } });
  expect(limited.status).toBe(429);
  checkCors(limited);
});

test("login and protected-route preflights finish without authentication", async () => {
  for (const path of ["/api/auth/login", "/api/auth/me"]) {
    const response = await fetch(`${base}${path}`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization" },
    });
    expect(response.status).toBe(204);
    checkCors(response);
    expect(response.headers.get("access-control-allow-headers")).toContain("Content-Type");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  }
});

test("validation and parser errors retain CORS", async () => {
  for (const body of ["{}", "{"]) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body,
    });
    expect(response.status).toBe(400);
    checkCors(response);
  }
});

test("existing origins remain approved and arbitrary origins are excluded", async () => {
  for (const approved of ["https://approved.example", "http://localhost:3000"]) {
    checkCors(await fetch(`${base}/health`, { headers: { Origin: approved } }), approved);
  }
  const denied = await fetch(`${base}/health`, { headers: { Origin: "https://unapproved.example" } });
  expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  const missing = await fetch(`${base}/missing`, { headers: { Origin: origin } });
  expect(missing.status).toBe(404);
  checkCors(missing);
});
