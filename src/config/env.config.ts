const requiredEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`❌ Missing environment variable: ${key}`);
  }

  return value;
};

export const env = {
  PORT: process.env.PORT || "5000",
  MONGO_URI: requiredEnv("MONGO_URI"),
};