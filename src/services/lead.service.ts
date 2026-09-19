import { parse } from "csv-parse/sync";
import { importCsvBid, parseCsvBidDetails, type CsvBidDetails } from "./lead-bid-import.service.ts";
import { enrichLeadLocation, type LocationEnrichment } from "./lead-enrichment.service.ts";
import { supabase } from "../config/supabase.ts";
import type { Lead } from "../types/lead.types.ts";
import type { Bid } from "../types/bid.types.ts";
import { createLeadSchema, type CreateLeadInput, type UpdateLeadInput } from "../validations/lead.validation.ts";
import type { MoveLeadToPipelineInput } from "../validations/bid.validation.ts";

export interface LeadFilters {
  search?: string;
  industry?: string;
  region?: string;
  project?: string;
  project_size?: string;
  phase?: string;
  lead_status?: string;
  status?: string;
  temperature?: string;
  min_score?: number;
  archived?: boolean;
  sort_by?: "created_at" | "updated_at" | "score" | "full_name" | "company" | "industry" | "project" | "region" | "project_size" | "phase" | "status" | "lead_status";
  sort_order?: "asc" | "desc";
}

const leadInsert = (data: CreateLeadInput) => ({
  full_name: data.full_name,
  email: data.email,
  company: data.company ?? null,
  job_title: data.job_title ?? null,
  phone: data.phone ?? null,
  industry: data.industry ?? null,
  region_group: data.region_group ?? null,
  region: data.region ?? null,
  state: data.state ?? null,
  country: data.country ?? null,
  project: data.project ?? null,
  project_size: data.project_size ?? null,
  project_value: data.project_value ?? null,
  currency: data.currency ?? null,
  phase: data.phase ?? null,
  lead_status: data.lead_status ?? null,
  status: data.status ?? "new",
  applications: data.applications,
  application_tools: data.application_tools,
  score: data.score,
  temperature: data.temperature ?? (data.score >= 80 ? "hot" : data.score >= 50 ? "warm" : "cool"),
  assigned_to: data.assigned_to ?? null,
  archived: data.archived,
});

const ensureEmailIsAvailable = async (email: string, excludeId?: string): Promise<void> => {
  let query = supabase
    .from("leads")
    .select("id")
    .ilike("email", email.trim().toLowerCase())
    .limit(1);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) {
    console.error("[LEAD] duplicate email check error:", error);
    throw Object.assign(new Error("Failed to validate lead email"), { statusCode: 500 });
  }
  if (data && data.length > 0) {
    throw Object.assign(new Error("A lead with this email already exists"), { statusCode: 409 });
  }
};

export const createLead = async (data: CreateLeadInput): Promise<Lead> => {
  await ensureEmailIsAvailable(data.email);

  let region_group: string | null | undefined = data.region_group;
  let region: string | null | undefined = data.region;
  let state: string | null | undefined = data.state;
  let country: string | null | undefined = data.country;
  if ([region_group, region, state, country].some((value) => value === undefined)) {
    const enriched = await enrichLeadLocation({
      company: data.company,
      project: data.project,
      project_size: data.project_size,
      region_group: data.region_group,
      region: data.region,
      state: data.state,
      country: data.country,
    });
    if (region_group === undefined) region_group = enriched.region_group;
    if (region === undefined) region = enriched.region;
    if (state === undefined) state = enriched.state;
    if (country === undefined) country = enriched.country;
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({ ...leadInsert(data), region_group: region_group ?? null, region: region ?? null, state: state ?? null, country: country ?? null })
    .select()
    .single();

  if (error) {
    console.error("[LEAD] createLead error:", error);
    throw Object.assign(
      new Error(error.code === "23505" ? "A lead with this email already exists" : "Failed to create lead"),
      { statusCode: error.code === "23505" ? 409 : 500 },
    );
  }

  return lead as Lead;
};

export const getLeads = async (
  page: number,
  limit: number,
  filters: LeadFilters = {},
): Promise<{ leads: Lead[]; total: number }> => {
  const offset = (page - 1) * limit;
  const applyFilters = <T>(query: T): T => {
    let filtered = query as any;
    if (filters.search) filtered = filtered.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company.ilike.%${filters.search}%,industry.ilike.%${filters.search}%,project.ilike.%${filters.search}%`);
    for (const key of ["industry", "region", "project", "project_size", "phase", "lead_status", "status", "temperature"] as const) {
      if (filters[key]) filtered = filtered.eq(key, filters[key]);
    }
    if (filters.min_score !== undefined) filtered = filtered.gte("score", filters.min_score);
    if (filters.archived !== undefined) filtered = filtered.eq("archived", filters.archived);
    return filtered;
  };
  const sortBy = filters.sort_by ?? "created_at";
  const ascending = filters.sort_order === "asc";
  const [result, countResult] = await Promise.all([
    applyFilters(supabase.from("leads").select("*")).order(sortBy, { ascending }).range(offset, offset + limit - 1),
    applyFilters(supabase.from("leads").select("id", { count: "exact", head: true })),
  ]);

  if (result.error) {
    console.error("[LEAD] getLeads error:", result.error);
    throw Object.assign(new Error("Failed to fetch leads"), {
      statusCode: 500,
    });
  }

  return {
    leads: (result.data ?? []) as Lead[],
    total: countResult.count ?? 0,
  };
};

export const getCountryOptions = async (): Promise<string[]> => {
  const countries = new Set<string>();
  let offset = 0;
  try {
    while (true) {
      const { data, error } = await supabase
        .from("leads")
        .select("country")
        .not("country", "is", null)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data) {
        const country = (row.country as string | null)?.trim();
        if (country) countries.add(country);
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    if (["42703", "PGRST204"].includes(failure.code ?? "") && failure.message?.includes("country")) {
      return [];
    }
    throw error;
  }
  return [...countries].sort((a, b) => a.localeCompare(b));
};

export const getLeadById = async (id: string): Promise<Lead> => {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("[LEAD] getLeadById error:", error);
    throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
  }

  return data as Lead;
};

export const updateLead = async (
  id: string,
  data: UpdateLeadInput,
): Promise<Lead> => {
  const updates: Record<string, unknown> = {};

  if (data.email !== undefined) await ensureEmailIsAvailable(data.email, id);

  if (data.full_name !== undefined) updates.full_name = data.full_name;
  if (data.email !== undefined) updates.email = data.email;
  if (data.company !== undefined) updates.company = data.company;
  if (data.job_title !== undefined) updates.job_title = data.job_title;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.industry !== undefined) updates.industry = data.industry;
  if (data.applications !== undefined) updates.applications = data.applications;
  if (data.application_tools !== undefined) updates.application_tools = data.application_tools;
  if (data.score !== undefined) updates.score = data.score;
  if (data.temperature !== undefined) updates.temperature = data.temperature;
  if (data.status !== undefined) updates.status = data.status;
  if (data.region_group !== undefined) updates.region_group = data.region_group;
  if (data.region !== undefined) updates.region = data.region;
  if (data.state !== undefined) updates.state = data.state;
  if (data.country !== undefined) updates.country = data.country;
  if (data.project !== undefined) updates.project = data.project;
  if (data.project_size !== undefined) updates.project_size = data.project_size;
  if (data.project_value !== undefined) updates.project_value = data.project_value;
  if (data.currency !== undefined) updates.currency = data.currency;
  if (data.phase !== undefined) updates.phase = data.phase;
  if (data.lead_status !== undefined) updates.lead_status = data.lead_status;
  if (data.assigned_to !== undefined) updates.assigned_to = data.assigned_to;
  if (data.archived !== undefined) updates.archived = data.archived;

  let enrichment: LocationEnrichment | undefined;
  if ([data.region_group, data.region, data.state, data.country].some((value) => value === undefined)) {
    const existing = await getLeadById(id);
    const fill = {
      region_group: data.region_group === undefined && existing.region_group === null,
      region: data.region === undefined && existing.region === null,
      state: data.state === undefined && existing.state === null,
      country: data.country === undefined && existing.country === null,
    };
    if (fill.region_group || fill.region || fill.state || fill.country) {
      enrichment = await enrichLeadLocation({
        company: existing.company ?? data.company,
        project: existing.project ?? data.project,
        project_size: existing.project_size ?? data.project_size,
        region_group: data.region_group !== undefined ? data.region_group : existing.region_group,
        region: data.region !== undefined ? data.region : existing.region,
        state: data.state !== undefined ? data.state : existing.state,
        country: data.country !== undefined ? data.country : existing.country,
      });
      if (fill.region_group) updates.region_group = enrichment.region_group;
      if (fill.region) updates.region = enrichment.region;
      if (fill.state) updates.state = enrichment.state;
      if (fill.country) updates.country = enrichment.country;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !lead) {
    console.error("[LEAD] updateLead error:", error);
    throw Object.assign(
      new Error(error?.code === "23505" ? "A lead with this email already exists" : "Lead not found"),
      { statusCode: error?.code === "23505" ? 409 : 404 },
    );
  }

  return lead as Lead;
};

export const moveLeadToPipeline = async (
  id: string,
  data: MoveLeadToPipelineInput,
): Promise<{ lead: Lead; bid: Bid }> => {
  const { data: result, error } = await supabase.rpc("move_lead_to_pipeline", {
    p_lead_id: id,
    p_project: data.project,
    p_client: data.client,
    p_phase: data.phase,
    p_deadline: data.deadline,
    p_suppliers: data.suppliers,
    p_value: data.value ?? null,
    p_currency: data.currency ?? null,
  });

  if (error) {
    console.error("[LEAD] moveLeadToPipeline error:", error);
    if (["PGRST202", "PGRST204", "42703"].includes(error.code ?? "")) {
      throw Object.assign(new Error("Pipeline currency support is out of date: the running server or deployed database predates bid currency. Apply scripts/bid-financials-migration.sql to the database and restart the server with the latest code."), { statusCode: 503 });
    }
    if (error.code === "22023") {
      throw Object.assign(new Error("Moving a lead into the pipeline requires a confirmed numeric value and a valid ISO 4217 currency"), { statusCode: 400 });
    }
    throw Object.assign(new Error(error.code === "P0002" ? "Lead not found" : "Failed to move lead to pipeline"), {
      statusCode: error.code === "P0002" ? 404 : 500,
    });
  }

  return result as { lead: Lead; bid: Bid };
};

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export interface ImportResult {
  bids_created: number;
  bids_updated: number;
  bids_failed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { row: number; message: string }[];
}

export const importLeads = async (file: Buffer): Promise<ImportResult> => {
  let rows: Record<string, string>[];
  try {
    rows = parse(file, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch {
    throw Object.assign(new Error("Invalid CSV file"), { statusCode: 400 });
  }
  if (rows.length === 0) throw Object.assign(new Error("CSV contains no data rows"), { statusCode: 400 });
  const required = ["full_name", "email"];
  if (!required.every((field) => Object.hasOwn(rows[0] ?? {}, field))) {
    throw Object.assign(new Error("CSV must include full_name and email headers"), { statusCode: 400 });
  }
  const seen = new Set<string>();
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, bids_created: 0, bids_updated: 0, bids_failed: 0, errors: [] };
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const email = normalize(row.email);
    if (!row.full_name?.trim() || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      result.failed++;
      result.errors.push({ row: rowNumber, message: "full_name and a valid email are required" });
      continue;
    }
    const duplicateMessage = `A lead with email ${email} already exists`;
    if (seen.has(email)) {
      result.skipped++;
      result.errors.push({ row: rowNumber, message: duplicateMessage });
      continue;
    }
    let bidDetails: CsvBidDetails | undefined;
    try { bidDetails = parseCsvBidDetails(row); } catch (error) {
      result.failed++;
      result.errors.push({ row: rowNumber, message: (error as Error).message });
      continue;
    }
    const saveBid = async () => {
      if (!bidDetails) return;
      try {
        const outcome = await importCsvBid(email, row, bidDetails);
        if (outcome === "created") result.bids_created++;
        else result.bids_updated++;
      } catch (error) {
        result.bids_failed++;
        result.errors.push({ row: rowNumber, message: `Lead saved, but bid details failed: ${(error as Error).message}` });
      }
    };
    const parsed = createLeadSchema.safeParse({
      full_name: row.full_name, email, company: row.company || undefined, job_title: row.job_title || undefined,
      phone: row.phone || undefined, industry: row.industry || undefined, region_group: row.region_group || undefined,
      region: row.region || undefined, state: row.state || undefined,
      country: row.country || undefined,
      project: row.project || undefined, project_size: row.project_size || undefined, phase: row.phase || undefined,
      project_value: row.project_value ? Number(row.project_value) : undefined, currency: row.currency || undefined,
      lead_status: row.lead_status || undefined, status: row.status || undefined,
      applications: row.applications ? Number(row.applications) : 0,
      application_tools: row.application_tools ? row.application_tools.split(";").map((tool) => tool.trim()).filter(Boolean) : [],
      score: row.score ? Number(row.score) : 0,
      temperature: row.temperature || undefined,
      assigned_to: row.assigned_to ? Number(row.assigned_to) : undefined, archived: row.archived === "true",
    });
    if (!parsed.success) {
      result.failed++;
      result.errors.push({ row: rowNumber, message: parsed.error.issues.map((issue) => issue.message).join("; ") });
      continue;
    }
    const findExisting = async () => {
      const { data, error } = await supabase.from("leads").select("id,region_group,region,state,country").ilike("email", email.replace(/[_%]/g, "\\$&")).limit(2);
      if (error) throw new Error("Failed to find existing lead");
      if (data && data.length > 1) throw new Error("Multiple leads have this email; edit the intended lead manually");
      return data?.[0];
    };
    const enrichIfBlank = async (stored: { region_group: string | null; region: string | null; state: string | null; country: string | null }): Promise<{ region_group?: string; region?: string; state?: string; country?: string }> => {
      const need = {
        region_group: !row.region_group?.trim() && stored.region_group === null,
        region: !row.region?.trim() && stored.region === null,
        state: !row.state?.trim() && stored.state === null,
        country: !row.country?.trim() && stored.country === null,
      };
      if (!Object.values(need).some(Boolean)) return {};
      const enriched = await enrichLeadLocation({
        company: parsed.data.company,
        project: parsed.data.project,
        project_size: parsed.data.project_size,
      });
      const additions: { region_group?: string; region?: string; state?: string; country?: string } = {};
      if (need.region_group && enriched.region_group) additions.region_group = enriched.region_group;
      if (need.region && enriched.region) additions.region = enriched.region;
      if (need.state && enriched.state) additions.state = enriched.state;
      if (need.country && enriched.country) additions.country = enriched.country;
      return additions;
    };
    const updateExisting = async (id: string, stored: { region_group: string | null; region: string | null; state: string | null; country: string | null }) => {
      // Only non-empty CSV fields are updates; defaults must not overwrite stored values.
      const updates = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => key !== "email" && Boolean(row[key]?.trim())));
      Object.assign(updates, await enrichIfBlank(stored));
      const { data, error } = await supabase.from("leads").update(updates).eq("id", id).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Lead no longer exists");
      result.updated++;
      seen.add(email);
      await saveBid();
    };
    try {
      const existing = await findExisting();
      if (existing) {
        await updateExisting(existing.id, { region_group: existing.region_group ?? null, region: existing.region ?? null, state: existing.state ?? null, country: existing.country ?? null });
        continue;
      }
    } catch (error) {
      result.failed++;
      result.errors.push({ row: rowNumber, message: (error as Error).message });
      continue;
    }
    const insertData = leadInsert(parsed.data);
    Object.assign(insertData, await enrichIfBlank({ region_group: null, region: null, state: null, country: null }));
    const { error: insertError } = await supabase.from("leads").insert(insertData);
    if (insertError) {
      if (insertError.code === "23505") {
        try {
          const existing = await findExisting();
          if (!existing) throw new Error(insertError.message);
          await updateExisting(existing.id, { region_group: existing.region_group ?? null, region: existing.region ?? null, state: existing.state ?? null, country: existing.country ?? null });
        } catch (error) {
          result.failed++;
          result.errors.push({ row: rowNumber, message: (error as Error).message });
        }
      } else {
        result.failed++;
        result.errors.push({ row: rowNumber, message: insertError.message });
      }
      continue;
    }
    seen.add(email); result.created++;
    await saveBid();
  }
  return result;
};

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export const leadsToCsv = async (leads: Lead[]): Promise<string> => {
  const bidsByLead = new Map<string, Bid[]>();
  for (let start = 0; start < leads.length; start += 200) {
    const ids = leads.slice(start, start + 200).map(lead => lead.id);
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await supabase.from("bids")
        .select("id,lead_id,value,suppliers,phase,deadline,project,client")
        .in("lead_id", ids).order("id").range(offset, offset + 199);
      if (error) throw Object.assign(new Error("Failed to fetch linked bids for CSV export"), { statusCode: 500 });
      for (const bid of (data ?? []) as Bid[]) {
        if (!bid.lead_id) continue;
        const linked = bidsByLead.get(bid.lead_id) ?? [];
        linked.push(bid);
        bidsByLead.set(bid.lead_id, linked);
      }
      if ((data?.length ?? 0) < 200) break;
    }
  }
  const columns = ["id", "full_name", "email", "company", "job_title", "phone", "industry", "region_group", "region", "state", "country", "project", "project_size", "project_value", "currency", "phase", "lead_status", "status", "applications", "application_tools", "score", "temperature", "assigned_to", "archived", "created_at", "updated_at"] as const;
  const bidColumns = ["bid_value", "suppliers", "bid_phase", "bid_deadline", "bid_project", "bid_client", "bid_id"];
  return [[...columns, ...bidColumns].join(","), ...leads.flatMap((lead) => {
    const linked = bidsByLead.get(lead.id) ?? [undefined];
    return linked.map(bid => {
    // JSON preserves supplier names containing semicolons, commas, or quotes.
    // Explicit null/[] round-trip unknown details; no bid exports blank cells.
    const bidValues = bid ? [bid.value ?? "null", JSON.stringify(bid.suppliers ?? []), bid.phase, bid.deadline, bid.project, bid.client, bid.id] : bidColumns.map(() => "");
    return [...columns.map(column => column === "application_tools" ? lead.application_tools.join(";") : lead[column]), ...bidValues].map(csvCell).join(",");
    });
  })].join("\n");
};

export const deleteLead = async (id: string): Promise<void> => {
  const { error } = await supabase.from("leads").delete().eq("id", id);

  if (error) {
    console.error("[LEAD] deleteLead error:", error);
    throw Object.assign(new Error("Failed to delete lead"), {
      statusCode: 500,
    });
  }
};

export const assignLead = async (
  id: string,
  assignedTo: number,
): Promise<Lead> => {
  const { data: assignee, error: assigneeError } = await supabase
    .from("users")
    .select("id")
    .eq("id", assignedTo)
    .single();

  if (assigneeError || !assignee) {
    throw Object.assign(new Error("Assignee not found"), { statusCode: 404 });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .update({ assigned_to: assignedTo })
    .eq("id", id)
    .select()
    .single();

  if (error || !lead) {
    console.error("[LEAD] assignLead error:", error);
    throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
  }

  return lead as Lead;
};
