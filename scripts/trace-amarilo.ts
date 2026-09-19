import { env } from "../src/config/env.config.ts";
import { enrichLeadLocation } from "../src/services/lead-enrichment.service.ts";
import { supabase } from "../src/config/supabase.ts";

console.log("=== 1. RAW payload sent to OpenRouter ===");
const { REGIONS } = await import("../src/config/regions.ts");
const system = [
  "You infer the geographic location of a business lead.",
  "Rules:",
  `- "country" is the specific country where the company is headquartered or primarily based, e.g. "Saudi Arabia" or "United States". Multinationals still resolve to their headquarters country.`,
  `- "region" is the broad classification and must be one of: ${REGIONS.join(", ")}.`,
  'Respond with "country": null AND "region": null only when no country can be determined from the evidence.',
  "Never infer location from IP addresses. Never guess from an email domain alone. Never answer with a country the evidence does not support.",
  'Respond with valid JSON only: {"country": string | null, "region": string | null}',
].join("\n");
console.log(JSON.stringify({ model: env.OPENROUTER_MODEL, system, user: 'Company name: "Amarilo S.A.S."' }, null, 2).slice(0, 1800));

console.log("\n=== 2. RAW OpenRouter response ===");
const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
  body: JSON.stringify({
    model: env.OPENROUTER_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: 'Company name: "Amarilo S.A.S."' },
    ],
  }),
});
const body = (await res.json()) as any;
console.log("HTTP", res.status);
console.log(body.choices?.[0]?.message?.content ?? JSON.stringify(body));

console.log("\n=== 3. enrichLeadLocation() parsed result ===");
const parsed = await enrichLeadLocation({ company: "Amarilo S.A.S." });
console.log(JSON.stringify(parsed));

console.log("\n=== 5. Stored rows matching amarilo ===");
const { data, error } = await supabase.from("leads").select("*").ilike("company", "%amarilo%");
if (error) console.error(error.message);
for (const r of (data ?? []) as any[]) {
  console.log(`${r.full_name} | company=${r.company} | country=${r.country ?? "NULL"} | region=${r.region ?? "NULL"}`);
}
process.exit(0);