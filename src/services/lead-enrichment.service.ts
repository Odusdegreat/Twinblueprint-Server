import { env } from "../config/env.config.ts";
import { REGIONS, REGION_GROUPS } from "../config/regions.ts";

export interface LocationEnrichment {
  country: string | null;
  state: string | null;
  region: string | null;
  region_group: string | null;
}

export interface LeadLocationHint {
  company?: string | null;
  project?: string | null;
  project_size?: string | null;
  state?: string | null;
  region?: string | null;
  region_group?: string | null;
  country?: string | null;
}

const REGION_LIST = REGIONS.join(", ");
const REGION_GROUP_LIST = REGION_GROUPS.join(", ");

const normalize = (value: string): string => value.toLowerCase().replace(/^(the|a|an)\s+/i, "").replace(/[^a-z0-9]/g, "");

const normalizeTo = (value: string, list: readonly string[]): string | null => {
  const candidates = [value, value.replace(/\(.*\)/, "").trim()];
  for (const candidate of candidates) {
    const target = normalize(candidate);
    if (!target) continue;
    for (const entry of list) {
      const full = normalize(entry);
      const base = normalize(entry.replace(/\(.*\)/, ""));
      if (full === target || (base && base === target)) return entry;
    }
  }
  return null;
};

const normalizeRegion = (value: string): string | null => normalizeTo(value, REGIONS);
const normalizeRegionGroup = (value: string): string | null => normalizeTo(value, REGION_GROUPS);

const extractJson = (content: string): Record<string, unknown> | null => {
  const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
};

const parseEnrichment = (raw: Record<string, unknown> | null): LocationEnrichment => {
  if (!raw) return { country: null, state: null, region: null, region_group: null };
  const country = typeof raw.country === "string" ? raw.country.trim() : "";
  if (!country || country.length > 100) return { country: null, state: null, region: null, region_group: null };
  const state = typeof raw.state === "string" ? raw.state.trim() : "";
  const region = typeof raw.region === "string" ? raw.region.trim() : "";
  const region_group = typeof raw.region_group === "string" ? raw.region_group.trim() : "";
  return {
    country,
    state: state && state.length <= 100 ? state : null,
    region: region ? normalizeRegion(region) : null,
    region_group: region_group ? normalizeRegionGroup(region_group) : null,
  };
};

export const enrichLeadLocation = async (hint: LeadLocationHint): Promise<LocationEnrichment> => {
  if (["1", "true"].includes(String(process.env.LEAD_ENRICHMENT_DISABLED).toLowerCase())) {
    return { country: null, state: null, region: null, region_group: null };
  }
  if (!env.OPENROUTER_API_KEY) {
    console.warn("[ENRICH] OPENROUTER_API_KEY not set; skipping location inference.");
    return { country: null, state: null, region: null, region_group: null };
  }

  const details = [
    hint.company?.trim() ? `Company name: "${hint.company.trim()}"` : null,
    hint.project?.trim() ? `Project / opportunity: "${hint.project.trim()}"` : null,
    hint.project_size?.trim() ? `Project size: "${hint.project_size.trim()}"` : null,
    hint.country?.trim() ? `Any known country text: "${hint.country.trim()}"` : null,
    hint.state?.trim() ? `Any known state/province text: "${hint.state.trim()}"` : null,
    hint.region?.trim() ? `Any known region text: "${hint.region.trim()}"` : null,
    hint.region_group?.trim() ? `Any known region group text: "${hint.region_group.trim()}"` : null,
  ].filter(Boolean).join("\n");

  const system = [
    "You infer the geographic base of a business lead from the company itself.",
    "Rules:",
    `- "country" is the specific country where the company is headquartered or primarily based, e.g. "Saudi Arabia" or "United States". Multinationals still resolve to their headquarters country.`,
    `- "state" is the administrative subdivision (state, province, department, district) of that country where the company is based, e.g. "Bogotá, D.C." for Colombia.`,
    `- "region" is the granular regional bucket and must be one of: ${REGION_LIST}.`,
    `- "region_group" is the broad global cluster and must be one of: ${REGION_GROUP_LIST}.`,
    'Respond with null for any field you cannot determine confidently. Never infer location from IP addresses. Never guess from an email domain alone. Never answer with data the evidence does not support.',
    'Respond with valid JSON only: {"country": string|null, "state": string|null, "region": string|null, "region_group": string|null}',
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: details || "No additional details available." },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    return parseEnrichment(content ? extractJson(content) : null);
  } catch (error) {
    console.error("[ENRICH] location inference failed:", error instanceof Error ? error.message : String(error));
    return { country: null, state: null, region: null, region_group: null };
  } finally {
    clearTimeout(timer);
  }
};