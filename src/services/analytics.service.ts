import { supabase } from "../config/supabase.ts";
import { singleCurrency } from "../config/currencies.ts";

interface WeeklyData {
  week: string;
  leads: number;
  emails: number;
  opens: number;
  clicks: number;
}

interface FunnelStage {
  stage: string;
  count: number;
  pct: number;
}

interface KPIs {
  lead_growth: number;
  qualified_rate: number;
  email_open_rate: number;
  click_through: number;
}

export const getWeeklyData = async (weeks: number): Promise<WeeklyData[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - weeks * 7);

  const [leadsResult, emailsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("created_at")
      .gte("created_at", startDate.toISOString()),
    supabase.from("email_logs").select("sent_at, opened_at, clicked_at").gte("sent_at", startDate.toISOString()),
  ]);

  if (leadsResult.error) {
    console.error("[ANALYTICS] getWeeklyData leads error:", leadsResult.error);
    throw Object.assign(new Error("Failed to fetch analytics"), { statusCode: 500 });
  }

  const weeklyMap = new Map<string, WeeklyData>();

  for (let i = 0; i < weeks; i++) {
    weeklyMap.set(`W${i + 1}`, { week: `W${i + 1}`, leads: 0, emails: 0, opens: 0, clicks: 0 });
  }

  const leads = leadsResult.data ?? [];
  for (const lead of leads) {
    const created = new Date(lead.created_at);
    const weekNum = Math.floor((created.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const key = `W${Math.min(weekNum, weeks)}`;
    const entry = weeklyMap.get(key);
    if (entry) entry.leads++;
  }

  const emails = emailsResult.data ?? [];
  for (const email of emails) {
    if (!email.sent_at) continue;
    const d = new Date(email.sent_at);
    const weekNum = Math.floor((d.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const key = `W${Math.min(weekNum, weeks)}`;
    const entry = weeklyMap.get(key);
    if (entry) {
      entry.emails++;
      if (email.opened_at) entry.opens++;
      if (email.clicked_at) entry.clicks++;
    }
  }

  return Array.from(weeklyMap.values());
};

export const getFunnelData = async (): Promise<FunnelStage[]> => {
  const { data: leads, error } = await supabase
    .from("leads")
    .select("status");

  if (error) {
    console.error("[ANALYTICS] getFunnelData error:", error);
    throw Object.assign(new Error("Failed to fetch funnel data"), { statusCode: 500 });
  }

  const rows = leads ?? [];
  const total = rows.length || 1;

  const discovery = rows.filter((row) => row.status === "new" || row.status === "contacted").length;
  const qualified = rows.filter((row) => row.status === "qualified").length;
  const proposal = rows.filter((row) => row.status === "proposal").length;
  const negotiation = rows.filter((row) => row.status === "negotiation").length;
  const closedWon = rows.filter((row) => row.status === "won").length;

  return [
    { stage: "Discovery", count: discovery, pct: Math.round((discovery / total) * 100) },
    { stage: "Qualified", count: qualified, pct: Math.round((qualified / total) * 100) },
    { stage: "Proposal", count: proposal, pct: Math.round((proposal / total) * 100) },
    { stage: "Negotiation", count: negotiation, pct: Math.round((negotiation / total) * 100) },
    { stage: "Closed Won", count: closedWon, pct: Math.round((closedWon / total) * 100) },
  ];
};

export const getKPIs = async (): Promise<KPIs> => {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [thisMonthLeads, lastMonthLeads, leads, emails] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", thisMonth.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", lastMonth.toISOString()).lt("created_at", thisMonth.toISOString()),
    supabase.from("leads").select("status"),
    supabase.from("email_logs").select("sent_at, opened_at, clicked_at"),
  ]);

  const thisCount = thisMonthLeads.count ?? 0;
  const lastCount = lastMonthLeads.count ?? 1;
  const lead_growth = lastCount > 0 ? Math.round(((thisCount - lastCount) / lastCount) * 1000) / 10 : 100;

  const leadRows = leads.data ?? [];
  const qualified = leadRows.filter((l) => l.status === "qualified").length;
  const qualified_rate = leadRows.length > 0 ? Math.round((qualified / leadRows.length) * 1000) / 10 : 0;

  const emailRows = emails.data ?? [];
  const total_sent = emailRows.filter((email) => email.sent_at).length;
  const total_opened = emailRows.filter((email) => email.opened_at).length;
  const total_clicked = emailRows.filter((email) => email.clicked_at).length;
  const email_open_rate = total_sent > 0 ? Math.round((total_opened / total_sent) * 1000) / 10 : 0;
  const click_through = total_sent > 0 ? Math.round((total_clicked / total_sent) * 1000) / 10 : 0;

  return { lead_growth, qualified_rate, email_open_rate, click_through };
};

export const getLeadsByApplication = async () => {
  const counts = new Map<string, { application: string; lead_count: number }>();
  // Page explicitly so totals include leads beyond the database response limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("leads").select("id,application_tools")
      .eq("archived", false).order("id").range(offset, offset + 499);
    if (error) throw Object.assign(new Error("Failed to fetch leads by application"), { statusCode: 500 });
    for (const lead of data ?? []) {
      const seen = new Set<string>();
      for (const tool of Array.isArray(lead.application_tools) ? lead.application_tools : []) {
        if (typeof tool !== "string" || !tool.trim()) continue;
        const name = tool.trim();
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = counts.get(key) ?? { application: name, lead_count: 0 };
        entry.lead_count++;
        counts.set(key, entry);
      }
    }
    if ((data?.length ?? 0) < 500) break;
  }
  return [...counts.values()].sort((a, b) => b.lead_count - a.lead_count || a.application.localeCompare(b.application));
};

export const getDashboard = async (weeks: number) => {
  const [kpis, lead_trend, funnel, leadsResult, bidsResult, projectsResult, emailsResult, leads_by_application] = await Promise.all([
    getKPIs(), getWeeklyData(weeks), getFunnelData(),
    supabase.from("leads").select("*").eq("archived", false),
    supabase.from("bids").select("lead_id, value, currency"),
    supabase.from("projects").select("id, status"),
    supabase.from("email_logs").select("sent_at"),
    getLeadsByApplication(),
  ]);
  if (leadsResult.error || bidsResult.error || projectsResult.error || emailsResult.error) {
    throw Object.assign(new Error("Failed to fetch dashboard analytics"), { statusCode: 500 });
  }
  const leads = leadsResult.data ?? [];
  const bids = bidsResult.data ?? [];
  const pipeline_value = bids.reduce((sum, bid) => sum + Number(bid.value ?? 0), 0);
  const industryCounts = new Map<string, number>();
  const applicationCounts = new Map<string, number>();
  const regionalCounts = new Map<string, { lead_count: number; pipeline_value: number; won_deal_value: number }>();
  const regionBids = new Map<string, { currency?: unknown }[]>();
  const wonLeadIds = new Set(leads.filter(lead => lead.status === "won").map(lead => lead.id));
  const leadRegion = new Map(leads.map((lead) => [lead.id, lead.region || "Unspecified"]));

  for (const lead of leads) {
    if (lead.industry) industryCounts.set(lead.industry, (industryCounts.get(lead.industry) ?? 0) + 1);
    for (const tool of (lead.application_tools ?? []) as string[]) {
      applicationCounts.set(tool, (applicationCounts.get(tool) ?? 0) + 1);
    }
    const region = lead.region || "Unspecified";
    const current = regionalCounts.get(region) ?? { lead_count: 0, pipeline_value: 0, won_deal_value: 0 };
    current.lead_count++;
    regionalCounts.set(region, current);
  }
  for (const bid of bids) {
    const region = bid.lead_id ? leadRegion.get(bid.lead_id) : undefined;
    if (!region) continue;
    const regionRows = regionBids.get(region) ?? [];
    regionRows.push(bid);
    regionBids.set(region, regionRows);
    const current = regionalCounts.get(region) ?? { lead_count: 0, pipeline_value: 0, won_deal_value: 0 };
    current.pipeline_value += Number(bid.value ?? 0);
    if (wonLeadIds.has(bid.lead_id)) current.won_deal_value += Number(bid.value ?? 0);
    regionalCounts.set(region, current);
  }

  return {
    kpis,
    summary: {
      total_leads: leads.length,
      pipeline_value,
      outreach_sent: (emailsResult.data ?? []).filter((email) => email.sent_at).length,
      conversion_rate: leads.length ? Math.round((leads.filter((lead) => lead.status === "won").length / leads.length) * 1000) / 10 : 0,
      countries: [...regionalCounts.keys()].filter((region) => region !== "Unspecified").length,
      active_projects: (projectsResult.data ?? []).filter((project) => project.status !== "Completed").length,
    },
    industry_distribution: [...industryCounts].map(([industry, count]) => ({ industry, count })),
    application_distribution: [...applicationCounts].map(([application, count]) => ({ application, count })).sort((a, b) => b.count - a.count),
    leads_by_application,
    pipeline_stages: funnel,
    lead_trend,
    email_engagement: lead_trend.map(({ week, emails, opens, clicks }) => ({ week, sent: emails, opens, clicks })),
    funnel,
    regional_coverage: [...regionalCounts].map(([region, data]) => ({
      region, ...data, currency: singleCurrency(regionBids.get(region) ?? []),
    })).sort((a, b) => b.won_deal_value - a.won_deal_value),
    qualified_leads: leads.filter((lead) => lead.status === "qualified"),
  };
};
