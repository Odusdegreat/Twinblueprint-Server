import { expect, test } from "bun:test";
import { env } from "../src/config/env.config.ts";
import { enrichLeadLocation } from "../src/services/lead-enrichment.service.ts";

process.env.LEAD_ENRICHMENT_DISABLED = "";

const savedKey = env.OPENROUTER_API_KEY;
const savedBase = env.OPENROUTER_BASE_URL;

const stubFetch = (body: string, status = 200) => {
  globalThis.fetch = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => {
      try {
        return JSON.parse(body);
      } catch {
        return { choices: [] };
      }
    },
  })) as unknown as typeof fetch;
};

test("skips inference and returns nulls when OpenRouter key is not configured", async () => {
  env.OPENROUTER_API_KEY = "";
  let called = false;
  globalThis.fetch = (async () => { called = true; throw new Error("should not be called"); }) as unknown as typeof fetch;
  const result = await enrichLeadLocation({ company: "ACME Saudi" });
  expect(result).toEqual({ country: null, state: null, region: null, region_group: null });
  expect(called).toBe(false);
});

test("parses fenced JSON and normalizes region and region_group into their canonical lists", async () => {
  env.OPENROUTER_API_KEY = "test-key";
  stubFetch(JSON.stringify({ choices: [{ message: { content: '```json\n{"country": "Saudi Arabia", "state": "Riyadh Province", "region": "Middle East", "region_group": "EMEA"}\n```' } }] }));
  const result = await enrichLeadLocation({ company: "ACME Riyadh", project: "Riyadh Metro" });
  expect(result).toEqual({ country: "Saudi Arabia", state: "Riyadh Province", region: "Middle East (GCC)", region_group: "EMEA" });
});

test("keeps a confident country but nulls a region and region_group outside the canonical lists", async () => {
  env.OPENROUTER_API_KEY = "test-key";
  stubFetch(JSON.stringify({ choices: [{ message: { content: '{"country":"Antarctica","state":"Ross Dependency","region":"Polar","region_group":"South Pole","extra":1}' } }] }));
  const result = await enrichLeadLocation({ company: "Penguin Research" });
  expect(result).toEqual({ country: "Antarctica", state: "Ross Dependency", region: null, region_group: null });
});

test("returns nulls when the model answers with no country", async () => {
  env.OPENROUTER_API_KEY = "test-key";
  stubFetch(JSON.stringify({ choices: [{ message: { content: '{"country":null,"state":null,"region":"EMEA","region_group":"EMEA"}' } }] }));
  const result = await enrichLeadLocation({ company: "Unknown Corp" });
  expect(result).toEqual({ country: null, state: null, region: null, region_group: null });
});

test("returns nulls on an OpenRouter HTTP error", async () => {
  env.OPENROUTER_API_KEY = "test-key";
  stubFetch("rate limited", 429);
  const result = await enrichLeadLocation({ company: "ACME" });
  expect(result).toEqual({ country: null, state: null, region: null, region_group: null });
});

test("returns nulls on non-JSON model output", async () => {
  env.OPENROUTER_API_KEY = "test-key";
  stubFetch(JSON.stringify({ choices: [{ message: { content: "I am sorry, I cannot help" } }] }));
  const result = await enrichLeadLocation({ company: "ACME" });
  expect(result).toEqual({ country: null, state: null, region: null, region_group: null });
});

test("maps a plausible region_group label to the canonical list", async () => {
  env.OPENROUTER_API_KEY = "test-key";
  stubFetch(JSON.stringify({ choices: [{ message: { content: '{"country":"Colombia","state":"Bogotá, D.C.","region":"Latin America","region_group":"The Americas"}' } }] }));
  const result = await enrichLeadLocation({ company: "Amarilo" });
  expect(result).toEqual({ country: "Colombia", state: "Bogotá, D.C.", region: "Latin America", region_group: "Americas" });
});

env.OPENROUTER_API_KEY = savedKey;
env.OPENROUTER_BASE_URL = savedBase;