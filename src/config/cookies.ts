import type { CookieOptions } from "express";

const isProd = process.env.NODE_ENV === "production";

// Overrides exist so the cookie cannot silently regress to Lax/insecure just because
// NODE_ENV is misconfigured in a deployed environment.
const sameSite = (process.env.AUTH_COOKIE_SAME_SITE ?? (isProd ? "none" : "lax")) as CookieOptions["sameSite"];
const secure = process.env.AUTH_COOKIE_SECURE ? process.env.AUTH_COOKIE_SECURE === "true" : isProd;

// Browsers reject SameSite=None cookies that are not also Secure, which would drop the
// session entirely rather than fail visibly.
if (sameSite === "none" && !secure) {
  throw new Error("AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true");
}

// The API is served from its own host (twinblueprint-server.onrender.com), which is a
// different site than twinblueprint.com. Cookies are therefore host-only for the API
// host — setting `domain: ".twinblueprint.com"` would be rejected by browsers because
// the Domain attribute must domain-match the responding host, and the auth cookie is
// never read by the front-end hosts anyway. Cross-subdomain sharing (main site vs crm)
// works for free because both front-ends talk to the same API host.
//
// That cross-site relationship also means SameSite=Strict/Lax would stop the browser
// attaching the cookie to API calls made from the front-end, so a deployed API needs
// SameSite=None + Secure. Cross-site cookie auth is guarded by an origin allowlist in
// the authenticate middleware.
export const cookieConfig: CookieOptions = {
  httpOnly: true,
  secure,
  sameSite,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// clearCookie must repeat the attributes used when the cookie was set, otherwise the
// browser keeps the original cookie.
export const clearCookieConfig: CookieOptions = {
  httpOnly: cookieConfig.httpOnly,
  secure: cookieConfig.secure,
  sameSite: cookieConfig.sameSite,
  path: cookieConfig.path,
};
