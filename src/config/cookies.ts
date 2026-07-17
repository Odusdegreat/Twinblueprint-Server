import type { CookieOptions } from "express";

const isProd = process.env.NODE_ENV === "production";

export const cookieConfig: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "strict" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
