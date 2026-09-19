import { normalizeEmailSender } from "./email-sender.ts";

const requiredEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
};

export const env = {
  // Server
  PORT: process.env.PORT || "5000",
  NODE_ENV: process.env.NODE_ENV || "development",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  CLIENT_URLS: (process.env.CLIENT_URLS || process.env.CLIENT_URL || "http://localhost:3000").split(",").map((url) => url.trim()).filter(Boolean),

  // Supabase
  SUPABASE_URL: requiredEnv("SUPABASE_URL"),
  SUPABASE_PUBLISHABLE_KEY: requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
  SUPABASE_SECRET_KEY: requiredEnv("SUPABASE_SECRET_KEY"),

  // JWT
  JWT_SECRET: requiredEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Admin passcode login (POST /api/auth/passcode)
  ADMIN_PASSCODE: process.env.ADMIN_PASSCODE || "",

  // Resend
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
  FROM_EMAIL: normalizeEmailSender(requiredEnv("FROM_EMAIL")),
  NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL || "twinblueprints@gmail.com",

  // OpenRouter (AI country/region enrichment for leads)
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
};
