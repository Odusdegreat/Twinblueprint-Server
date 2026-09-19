import { supabase } from "../config/supabase.ts";
import type { Supplier } from "../validations/supplier.validation.ts";
import { getOpportunitySummaries } from "./opportunity.service.ts";

// Chunk filters and page results so relationship counts are not capped by PostgREST.
const linkedRows = async (table: string, columns: string, key: string, ids: string[], order: string[]) => {
  const rows: any[] = [];
  const uniqueIds = [...new Set(ids)];
  for (let start = 0; start < uniqueIds.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from(table).select(columns).in(key, uniqueIds.slice(start, start + 100));
      for (const column of order) query = query.order(column);
      const { data, error } = await query.range(offset, offset + 499);
      if (error) throw Object.assign(new Error(`Failed to fetch supplier intelligence (${table})`), { statusCode: 500 });
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) break;
    }
  }
  return rows;
};

const allRows = async (table: string, columns: string, order: string[]) => {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select(columns);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw Object.assign(new Error(`Failed to fetch supplier intelligence (${table})`), { statusCode: 500 });
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  return rows;
};

const loadProjects = async () => {
  try {
    return await allRows("projects", "id,bid_id,project,client,status,phase,value,currency,suppliers", ["id"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("projects")) throw error;
    console.warn("[SUPPLIERS] Project phase/value columns unavailable; apply scripts/supplier-migration.sql for complete project badges.");
    return allRows("projects", "id,bid_id,project,client,status,suppliers", ["id"]);
  }
};

export const enrichSuppliers = async (suppliers: Supplier[], detailed = false) => {
  const links = await linkedRows("bid_suppliers", "bid_id,supplier_id", "supplier_id", suppliers.map(s => s.id), ["supplier_id", "bid_id"]);
  const bidIds = links.map(link => link.bid_id);
  const [bids, projects, projectLinks] = await Promise.all([
    linkedRows("bids", "id,lead_id,client,project,value,status", "id", bidIds, ["id"]),
    loadProjects(),
    linkedRows("project_suppliers", "project_id,supplier_id", "supplier_id", suppliers.map(s => s.id), ["supplier_id", "project_id"]).catch(() => []),
  ]);
  const leads = await linkedRows("leads", "id,region", "id", bids.map(b => b.lead_id).filter(Boolean), ["id"]);
  const regionByLead = new Map(leads.map(lead => [lead.id, lead.region]));
  const partners = detailed ? await linkedRows("bid_suppliers", "bid_id,supplier_id", "bid_id", projects.map(p => p.bid_id).filter(Boolean), ["bid_id", "supplier_id"]) : [];
  const profiles = detailed ? await linkedRows("suppliers", "id,name,role", "id", partners.map(p => p.supplier_id), ["id"]) : [];
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));

  return Promise.all(suppliers.map(async supplier => {
    const supplierBidIds = new Set(links.filter(link => link.supplier_id === supplier.id).map(link => link.bid_id));
    const supplierProjectIds = new Set(projectLinks.filter(link => link.supplier_id === supplier.id).map(link => link.project_id));
    const supplierName = String(supplier.name ?? "").trim().toLowerCase();
    const supplierBids = bids.filter(bid => supplierBidIds.has(bid.id));
    const supplierProjects = projects.filter(project => {
      const assignedNames = Array.isArray(project.suppliers) ? project.suppliers : [];
      const assignedByName = assignedNames.some((name: unknown) => typeof name === "string" && name.trim().toLowerCase() === supplierName);
      return supplierProjectIds.has(project.id) || assignedByName || supplierBidIds.has(project.bid_id);
    });
    const active = supplierProjects.filter(project => ["active", "in-flight"].includes(String(project.status).toLowerCase()));
    const regions = [...new Set(supplierBids.map(bid => regionByLead.get(bid.lead_id)).filter((region): region is string => typeof region === "string" && !!region.trim()).map(region => region.trim()))].sort();
    const summary = { ...supplier, active_project_count: active.length, regions };
    if (!detailed) return summary;
    const shared = new Map<string, Set<string>>();
    for (const project of supplierProjects) {
      for (const partner of partners.filter(link => link.bid_id === project.bid_id && link.supplier_id !== supplier.id)) {
        const ids = shared.get(partner.supplier_id) ?? new Set<string>();
        ids.add(project.id);
        shared.set(partner.supplier_id, ids);
      }
    }
    let opportunities;
    try {
      opportunities = await getOpportunitySummaries(supplier.id);
    } catch (error) {
      const message = (error as { message?: string }).message ?? "";
      if (!message.includes("migration has not been applied") && !(error instanceof TypeError)) throw error;
      opportunities = supplierBids.filter(bid => String(bid.status).toLowerCase() === "active").map(bid => ({
        id: bid.id, name: bid.client ?? "", project: bid.project ?? null,
        value: bid.value === null || bid.value === undefined ? null : Number(bid.value),
        currency: null, insight: supplier.opportunity ?? null,
      }));
    }
    return {
      ...summary,
      active_projects: active.map(project => ({ id: project.id, name: project.project, client: project.client, status: project.status, phase: project.phase ?? null, value: project.value === null || project.value === undefined ? null : Number(project.value), currency: project.currency ?? null })),
      related_suppliers: [...shared].filter(([id]) => profileById.has(id)).map(([id, ids]) => ({ ...profileById.get(id), shared_project_count: ids.size })).sort((a, b) => b.shared_project_count - a.shared_project_count || a.name.localeCompare(b.name)),
      // Opportunities are actual active linked bids, not guessed companies or leads.
      opportunities: opportunities.map(opportunity => ({ id: opportunity.id, name: opportunity.name, project: opportunity.project, value: opportunity.value, currency: opportunity.currency, insight: opportunity.insight, ...("status" in opportunity ? { status: opportunity.status } : {}) })),
    };
  }));
};
