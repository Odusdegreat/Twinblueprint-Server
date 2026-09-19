import { supabase } from "../config/supabase.ts";
import type { Opportunity, SupplierOpportunity } from "../types/opportunity.types.ts";
import type { CreateOpportunityInput, UpdateOpportunityInput } from "../validations/opportunity.validation.ts";

const fail = (message: string, statusCode = 500) => Object.assign(new Error(message), { statusCode });

const isMissingTable = (error: { code?: string } | null) =>
  !!error && ["PGRST205", "PGRST200", "42P01"].includes(error.code ?? "");

const ensureSupplier = async (id: string) => {
  const { data, error } = await supabase.from("suppliers").select("id").eq("id", id).maybeSingle();
  if (error) throw fail("Failed to validate supplier");
  if (!data) throw fail("Supplier not found", 404);
};

const mapProjectNames = async (opportunities: Opportunity[]) => {
  const projectIds = [...new Set(opportunities.map(opportunity => opportunity.project_id).filter((id): id is string => !!id))];
  if (!projectIds.length) return opportunities.map(opportunity => ({ ...opportunity, project: null }));
  const { data, error } = await supabase.from("projects").select("id,project").in("id", projectIds);
  if (error) throw fail("Failed to fetch opportunity projects");
  const names = new Map((data ?? []).map(project => [project.id, project.project ?? null]));
  return opportunities.map(opportunity => ({ ...opportunity, project: opportunity.project_id ? names.get(opportunity.project_id) ?? null : null }));
};

export const listOpportunities = async (search: string | undefined, page: number, limit: number) => {
  const offset = (page - 1) * limit;
  let query = supabase.from("opportunities").select("*", { count: "exact" });
  if (search?.trim()) {
    const term = search.trim().replace(/[\\%_]/g, character => `\\${character}`).replace(/,/g, "\\,");
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,insight.ilike.%${term}%`);
  }
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    if (isMissingTable(error)) throw fail("Opportunities migration has not been applied", 500);
    throw fail("Failed to fetch opportunities");
  }
  return {
    opportunities: await mapProjectNames((data ?? []) as Opportunity[]),
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  };
};

export const listSupplierOpportunities = async (supplierId: string, page: number, limit: number) => {
  await ensureSupplier(supplierId);
  const offset = (page - 1) * limit;
  const [directResult, linksResult] = await Promise.all([
    supabase.from("opportunities").select("*").eq("supplier_id", supplierId),
    supabase.from("opportunity_suppliers").select("opportunity_id").eq("supplier_id", supplierId),
  ]);
  const linkedIds = (linksResult.data ?? []).map(link => link.opportunity_id).filter((id: string) => id !== undefined);
  const linkedResult = linkedIds.length
    ? await supabase.from("opportunities").select("*").in("id", linkedIds)
    : { data: [], error: null };
  const result = { data: [...(directResult.data ?? []), ...(linkedResult.data ?? [])], error: directResult.error ?? linksResult.error ?? linkedResult.error };
  if (result.error) {
    if (isMissingTable(result.error)) throw fail("Opportunities migration has not been applied", 500);
    throw fail("Failed to fetch supplier opportunities");
  }
  const unique = [...new Map((result.data as Opportunity[]).map(opportunity => [opportunity.id, opportunity])).values()]
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const opportunities = await mapProjectNames(unique.slice(offset, offset + limit));
  return { opportunities, pagination: { page, limit, total: unique.length, pages: Math.ceil(unique.length / limit) } };
};

export const createOpportunity = async (data: CreateOpportunityInput) => {
  await ensureSupplier(data.supplier_id);
  const { data: opportunity, error } = await supabase.from("opportunities").insert({
    supplier_id: data.supplier_id,
    lead_id: data.lead_id ?? null,
    project_id: data.project_id ?? null,
    bid_id: data.bid_id ?? null,
    name: data.name,
    description: data.description ?? null,
    insight: data.insight ?? null,
    status: data.status,
    value: data.value ?? null,
    currency: data.currency ?? null,
  }).select().single();
  if (error || !opportunity) throw fail(error?.code === "23503" ? "Linked record not found" : "Failed to create opportunity", error?.code === "23503" ? 404 : 500);
  return opportunity as Opportunity;
};

export const getOpportunity = async (id: string) => {
  const { data, error } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (error) throw fail(isMissingTable(error) ? "Opportunities migration has not been applied" : "Failed to fetch opportunity", isMissingTable(error) ? 500 : 500);
  if (!data) throw fail("Opportunity not found", 404);
  return data as Opportunity;
};

export const updateOpportunity = async (id: string, data: UpdateOpportunityInput) => {
  if (data.supplier_id) await ensureSupplier(data.supplier_id);
  const updates = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value]));
  const { data: opportunity, error } = await supabase.from("opportunities").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw fail("Failed to update opportunity");
  if (!opportunity) throw fail("Opportunity not found", 404);
  return opportunity as Opportunity;
};

export const deleteOpportunity = async (id: string) => {
  const { data, error } = await supabase.from("opportunities").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw fail("Failed to delete opportunity");
  if (!data) throw fail("Opportunity not found", 404);
};

export const linkOpportunitySupplier = async (opportunityId: string, supplierId: string, remove = false) => {
  await getOpportunity(opportunityId);
  await ensureSupplier(supplierId);
  const result = remove
    ? await supabase.from("opportunity_suppliers").delete().eq("opportunity_id", opportunityId).eq("supplier_id", supplierId)
    : await supabase.from("opportunity_suppliers").upsert({ opportunity_id: opportunityId, supplier_id: supplierId }, { onConflict: "opportunity_id,supplier_id" });
  if (result.error) throw fail("Failed to save opportunity supplier link", result.error.code === "23503" ? 404 : 500);
};

export const getOpportunitySummaries = async (supplierId: string): Promise<SupplierOpportunity[]> => {
  const result = await listSupplierOpportunities(supplierId, 1, 1000);
  return result.opportunities.map(opportunity => ({ ...opportunity }));
};