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

  // Supabase
  SUPABASE_URL: requiredEnv("SUPABASE_URL"),
  SUPABASE_PUBLISHABLE_KEY: requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
  SUPABASE_SECRET_KEY: requiredEnv("SUPABASE_SECRET_KEY"),

  // JWT
  JWT_SECRET: requiredEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Resend
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  FROM_EMAIL: requiredEnv("FROM_EMAIL"),
  NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL || "twinblueprints@gmail.com",
};
