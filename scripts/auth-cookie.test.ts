import { afterEach, expect, test } from "bun:test";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";

// Isolate from deployment secrets; these checks never query external services.
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
process.env.SUPABASE_SECRET_KEY = "test-key";
process.env.JWT_SECRET = "test-secret-for-cookie-checks-only-32-ch";
process.env.FROM_EMAIL = "test@example.com";
process.env.CLIENT_URLS = "https://approved.example, http://localhost:3000";

const { authenticate } = await import("../src/middleware/auth.ts");
const { cookieConfig, clearCookieConfig } = await import("../src/config/cookies.ts");
const { env } = await import("../src/config/env.config.ts");

const servers: Server[] = [];
afterEach(() => { for (const server of servers.splice(0)) { server.closeAllConnections(); server.close(); } });

async function fixture() {
  const app = express();
  app.use(cookieParser());
  app.get("/login", (_req, res) => res.cookie("token", "signed-in", cookieConfig));
  app.post("/logout", (req, res) => res.clearCookie("token", clearCookieConfig).status(204).end());
  app.all("/protected", authenticate, (req, res) => res.json({ userId: req.userId }));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  return async (path: string, headers: Record<string, string>, method = "GET") => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers });
    await response.text();
    return response;
  };
}

const bearer = jwt.sign({ sub: "test-user", role: "admin" }, env.JWT_SECRET);
const asCookie = (token: string) => ({ Cookie: `token=${token}` });

test("production origins and the vercel preview are approved for CORS", () => {
  for (const origin of [
    "https://twinblueprint.com",
    "https://www.twinblueprint.com",
    "https://crm.twinblueprint.com",
    "https://twinblueprint.vercel.app",
  ]) {
    expect(env.CLIENT_URLS).toContain(origin);
  }
});

test("the auth cookie is host-only and sent cross-site in production", () => {
  // A Domain attribute for the front-end domains would be rejected: the API host does
  // not domain-match twinblueprint.com, and the front-ends never read the cookie.
  expect(cookieConfig.domain).toBeUndefined();
  expect(clearCookieConfig).toMatchObject({ path: cookieConfig.path, sameSite: cookieConfig.sameSite, secure: cookieConfig.secure });
  expect(cookieConfig.httpOnly).toBe(true);
  expect(cookieConfig.sameSite).toBe(process.env.NODE_ENV === "production" ? "none" : "lax");
  expect(cookieConfig.secure).toBe(process.env.NODE_ENV === "production");
});

test("a deployed API can be forced cross-site without NODE_ENV", async () => {
  const previous = { sameSite: process.env.AUTH_COOKIE_SAME_SITE, secure: process.env.AUTH_COOKIE_SECURE };
  try {
    // Mirrors a Render service still reporting NODE_ENV=development.
    process.env.AUTH_COOKIE_SAME_SITE = "none";
    process.env.AUTH_COOKIE_SECURE = "true";
    const forced = await import(`../src/config/cookies.ts?forced=${Date.now()}`);
    expect(forced.cookieConfig.sameSite).toBe("none");
    expect(forced.cookieConfig.secure).toBe(true);
    expect(forced.clearCookieConfig.sameSite).toBe("none");

    // SameSite=None without Secure is rejected by browsers, so fail at boot instead.
    process.env.AUTH_COOKIE_SECURE = "false";
    await expect(import(`../src/config/cookies.ts?invalid=${Date.now()}`)).rejects.toThrow(/requires AUTH_COOKIE_SECURE/);
  } finally {
    for (const [key, value] of [["AUTH_COOKIE_SAME_SITE", previous.sameSite], ["AUTH_COOKIE_SECURE", previous.secure]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("cookie auth allows safe methods without an origin", async () => {
  const request = await fixture();
  expect((await request("/protected", asCookie(bearer))).status).toBe(200);
});

test("cookie auth allows unsafe methods from approved origins", async () => {
  const request = await fixture();
  for (const origin of ["https://twinblueprint.com", "https://www.twinblueprint.com", "https://crm.twinblueprint.com"]) {
    const response = await request("/protected", { ...asCookie(bearer), Origin: origin }, "POST");
    expect(response.status).toBe(200);
  }
});

test("cookie auth rejects unsafe methods from untrusted or absent origins", async () => {
  const request = await fixture();
  for (const headers of [
    { Origin: "https://evil.example" },
    { Origin: "https://crm.twinblueprint.com.evil.example" },
    { Origin: "https://twinblueprint.com:8443" },
    {},
  ]) {
    const response = await request("/protected", { ...asCookie(bearer), ...headers }, "POST");
    expect(response.status).toBe(403);
  }
  expect((await request("/protected", asCookie("not-a-jwt"), "POST")).status).toBe(403);
  expect((await request("/protected", asCookie("not-a-jwt"))).status).toBe(401);
});

test("bearer auth is unaffected by the origin check", async () => {
  const request = await fixture();
  for (const headers of [{ Origin: "https://evil.example" }, {}]) {
    const response = await request("/protected", { ...headers, Authorization: `Bearer ${bearer}` }, "POST");
    expect(response.status).toBe(200);
  }
});
