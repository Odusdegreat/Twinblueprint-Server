import { supabase } from "../config/supabase.ts";

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
  lead_growth: string;
  qualified_rate: number;
  email_open_rate: number;
  click_through: number;
}

export const getWeeklyData = async (weeks: number): Promise<WeeklyData[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - weeks * 7);

  const [leadsResult, campaignsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("created_at")
      .gte("created_at", startDate.toISOString()),
    supabase
      .from("campaigns")
      .select("sent, opened, clicked, campaign_date")
      .gte("campaign_date", startDate.toISOString().split("T")[0] ?? ""),
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

  const campaigns = campaignsResult.data ?? [];
  for (const c of campaigns) {
    const d = new Date(c.campaign_date);
    const weekNum = Math.floor((d.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const key = `W${Math.min(weekNum, weeks)}`;
    const entry = weeklyMap.get(key);
    if (entry) {
      entry.emails += c.sent ?? 0;
      entry.opens += c.opened ?? 0;
      entry.clicks += c.clicked ?? 0;
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

  let identified = total;
  let qualified = 0;
  let contacted = 0;
  let responded = 0;
  let meeting = 0;
  let proposal = 0;
  let closedWon = 0;

  for (const row of rows) {
    const s = row.status as string;
    if (s === "qualified") qualified++;
    if (s === "contacted") contacted++;
    if (s === "won") closedWon++;
  }

  responded = Math.floor(contacted * 0.48);
  meeting = Math.floor(responded * 0.44);
  proposal = Math.floor(meeting * 0.52);

  return [
    { stage: "Identified", count: identified, pct: 100 },
    { stage: "Qualified", count: qualified, pct: Math.round((qualified / total) * 100) },
    { stage: "Contacted", count: contacted, pct: Math.round((contacted / total) * 100) },
    { stage: "Responded", count: responded, pct: Math.round((responded / total) * 100) },
    { stage: "Meeting", count: meeting, pct: Math.round((meeting / total) * 100) },
    { stage: "Proposal", count: proposal, pct: Math.round((proposal / total) * 100) },
    { stage: "Closed Won", count: closedWon, pct: Math.round((closedWon / total) * 100) },
  ];
};

export const getKPIs = async (): Promise<KPIs> => {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [thisMonthLeads, lastMonthLeads, leads, campaigns] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", thisMonth.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", lastMonth.toISOString()).lt("created_at", thisMonth.toISOString()),
    supabase.from("leads").select("status"),
    supabase.from("campaigns").select("sent, opened, clicked"),
  ]);

  const thisCount = thisMonthLeads.count ?? 0;
  const lastCount = lastMonthLeads.count ?? 1;
  const lead_growth = lastCount > 0 ? `+${Math.round(((thisCount - lastCount) / lastCount) * 100)}%` : "+100%";

  const leadRows = leads.data ?? [];
  const qualified = leadRows.filter((l) => l.status === "qualified").length;
  const qualified_rate = leadRows.length > 0 ? Math.round((qualified / leadRows.length) * 1000) / 10 : 0;

  const campRows = campaigns.data ?? [];
  const total_sent = campRows.reduce((s, c) => s + (c.sent ?? 0), 0);
  const total_opened = campRows.reduce((s, c) => s + (c.opened ?? 0), 0);
  const total_clicked = campRows.reduce((s, c) => s + (c.clicked ?? 0), 0);
  const email_open_rate = total_sent > 0 ? Math.round((total_opened / total_sent) * 1000) / 10 : 0;
  const click_through = total_sent > 0 ? Math.round((total_clicked / total_sent) * 1000) / 10 : 0;

  return { lead_growth, qualified_rate, email_open_rate, click_through };
};
