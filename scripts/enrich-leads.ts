import { env } from "../src/config/env.config.ts";
import { supabase } from "../src/config/supabase.ts";
import { enrichLeadLocation } from "../src/services/lead-enrichment.service.ts";

interface LeadRow {
  id: string;
  company: string | null;
  project: string | null;
  project_size: string | null;
  region_group: string | null;
  region: string | null;
  state: string | null;
  country: string | null;
}

interface Outcome {
  country_filled: number;
  state_filled: number;
  region_filled: number;
  region_group_filled: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const findMissing = async (): Promise<LeadRow[]> => {
  const rows: LeadRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("leads")
      .select("id,company,project,project_size,region_group,region,state,country")
      .or("region_group.is.null,region.is.null,state.is.null,country.is.null")
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as LeadRow[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
};

const run = async (): Promise<void> => {
  if (!env.OPENROUTER_API_KEY) {
    console.warn("[ENRICH-BACKFILL] OPENROUTER_API_KEY not set; nothing to do. Add it to .env first.");
    process.exit(0);
  }

  const rows = await findMissing();
  console.log(`[ENRICH-BACKFILL] ${rows.length} lead(s) missing region_group and/or region and/or state and/or country.`);

  const outcome: Outcome = { country_filled: 0, state_filled: 0, region_filled: 0, region_group_filled: 0, skipped: 0, failed: 0, errors: [] };

  for (const [index, lead] of rows.entries()) {
    if (lead.region_group !== null && lead.region !== null && lead.state !== null && lead.country !== null) {
      outcome.skipped++;
      continue;
    }
    const enriched = await enrichLeadLocation({
      company: lead.company,
      project: lead.project,
      project_size: lead.project_size,
      region_group: lead.region_group,
      region: lead.region,
      state: lead.state,
      country: lead.country,
    });
    const updates: { region_group?: string | null; region?: string | null; state?: string | null; country?: string | null } = {};
    if (lead.region_group === null) updates.region_group = enriched.region_group;
    if (lead.region === null) updates.region = enriched.region;
    if (lead.state === null) updates.state = enriched.state;
    if (lead.country === null) updates.country = enriched.country;
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("leads").update(updates).eq("id", lead.id);
      if (error) {
        outcome.failed++;
        outcome.errors.push(`${lead.id}: ${error.message}`);
        console.error(`[ENRICH-BACKFILL] failed ${lead.id}: ${error.message}`);
        continue;
      }
    }
    if (updates.country !== undefined && updates.country !== null) outcome.country_filled++;
    if (updates.state !== undefined && updates.state !== null) outcome.state_filled++;
    if (updates.region !== undefined && updates.region !== null) outcome.region_filled++;
    if (updates.region_group !== undefined && updates.region_group !== null) outcome.region_group_filled++;
    if ((index + 1) % 25 === 0 || index === rows.length - 1) {
      console.log(`[ENRICH-BACKFILL] progress ${index + 1}/${rows.length}`);
    }
  }

  console.log(`[ENRICH-BACKFILL] done. country_filled=${outcome.country_filled} state_filled=${outcome.state_filled} region_filled=${outcome.region_filled} region_group_filled=${outcome.region_group_filled} skipped=${outcome.skipped} failed=${outcome.failed}`);
  if (outcome.errors.length) console.log("[ENRICH-BACKFILL] errors:", outcome.errors.join("\n"));
};

run().catch((error) => {
  console.error("[ENRICH-BACKFILL] fatal:", error);
  process.exit(1);
});