import { expect, mock, test } from "bun:test";

let existing: { id: string; country: string | null; region: string | null; state: string | null; region_group: string | null } | null = null;
let inserted: any = null;
let updated: Record<string, unknown> = {};
let fetchCalls = 0;

mock.module("../src/config/supabase.ts", () => ({
  supabase: {
    from: (table: string) => table === "bids" ? {
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
    } : ({
      select: () => ({ ilike: () => ({ limit: async () => ({ data: existing ? [existing] : [], error: null }) }) }),
      insert: async (value: unknown) => { inserted = value; return { error: null }; },
      update: (value: Record<string, unknown>) => { updated = value; return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "existing" }, error: null }) }) }) }; },
    }),
  },
}));

mock.module("../src/services/email.service.ts", () => ({ emailService: {} }));
mock.module("../src/config/env.config.ts", () => ({ env: { OPENROUTER_API_KEY: "test-key", OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1", OPENROUTER_MODEL: "openai/gpt-4o-mini" } }));

globalThis.fetch = (async () => {
  fetchCalls++;
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message: { content: '{"country":"Saudi Arabia","state":"Eastern Province","region":"Middle East (GCC)","region_group":"EMEA"}' } }] }),
  };
}) as unknown as typeof fetch;

const { importLeads } = await import("../src/services/lead.service.ts");

test("CSV create with blank country/region is enriched by AI from the company", async () => {
  existing = null;
  fetchCalls = 0;
  const result = await importLeads(Buffer.from("full_name,email,company\nJane Doe,jane@example.com,Saudi Aramco"));
  expect(result.created).toBe(1);
  expect(fetchCalls).toBeGreaterThan(0);
  expect(inserted.country).toBe("Saudi Arabia");
  expect(inserted.state).toBe("Eastern Province");
  expect(inserted.region).toBe("Middle East (GCC)");
  expect(inserted.region_group).toBe("EMEA");
});

test("explicit CSV country/region win and only missing region_group/state are AI-filled", async () => {
  existing = null;
  fetchCalls = 0;
  const result = await importLeads(Buffer.from("full_name,email,company,country,region\nJane Doe,jane@example.com,Acme,Kenya,Africa"));
  expect(result.created).toBe(1);
  expect(fetchCalls).toBe(1);
  expect(inserted.country).toBe("Kenya");
  expect(inserted.region).toBe("Africa");
  expect(inserted.region_group).toBe("EMEA");
});

test("existing lead with a stored country is not overwritten; only missing region_group/state are AI-filled", async () => {
  existing = { id: "existing", country: "Kenya", region: "Africa", state: null, region_group: null };
  fetchCalls = 0;
  const result = await importLeads(Buffer.from("full_name,email,company\nJane Doe,jane@example.com,New Corp"));
  expect(result.updated).toBe(1);
  expect(fetchCalls).toBe(1);
  expect(updated.country).toBeUndefined();
  expect(updated.region).toBeUndefined();
  expect(updated.region_group).toBe("EMEA");
  expect(updated.state).toBe("Eastern Province");
});

test("existing lead with NULL country/region gets AI-filled when CSV cells are blank", async () => {
  existing = { id: "existing", country: null, region: null, state: null, region_group: null };
  fetchCalls = 0;
  const result = await importLeads(Buffer.from("full_name,email,company\nJane Doe,jane@example.com,Saudi Aramco"));
  expect(result.updated).toBe(1);
  expect(fetchCalls).toBeGreaterThan(0);
  expect(updated.country).toBe("Saudi Arabia");
  expect(updated.state).toBe("Eastern Province");
  expect(updated.region).toBe("Middle East (GCC)");
  expect(updated.region_group).toBe("EMEA");
});