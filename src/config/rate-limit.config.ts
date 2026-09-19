function integerSetting(source: NodeJS.ProcessEnv, key: string, fallback: number, minimum = 1): number {
  const raw = source[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value) || value < minimum || value > 2_147_483_647) {
    throw new Error(`${key} must be an integer between ${minimum} and 2147483647`);
  }
  return value;
}

export function readRateLimitConfig(source: NodeJS.ProcessEnv = process.env) {
  return {
    // Render's direct ingress uses one trusted hop. Override for other topologies.
    trustProxyHops: integerSetting(source, "TRUST_PROXY_HOPS", source.RENDER === "true" ? 1 : 0, 0),
    windowMs: integerSetting(source, "API_RATE_LIMIT_WINDOW_MS", 60_000),
    readLimit: integerSetting(source, "API_RATE_LIMIT_READ_MAX", 600),
    writeLimit: integerSetting(source, "API_RATE_LIMIT_WRITE_MAX", 120),
  };
}
