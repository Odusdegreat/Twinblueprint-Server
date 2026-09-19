import { supabase } from "../config/supabase.ts";
import type { Campaign, CampaignWithStats, CampaignStats } from "../types/campaign.types.ts";
import type { CreateCampaignInput, UpdateCampaignInput } from "../validations/campaign.validation.ts";

type CampaignCounters = Pick<
  CampaignWithStats,
  "sent" | "opened" | "clicked" | "open_rate" | "ctr"
>;

const roundTo1dp = (value: number): number => Math.round(value * 10) / 10;

const getCampaignCounters = async (
  campaignIds: string[],
): Promise<Map<string, CampaignCounters>> => {
  const counters = new Map<string, CampaignCounters>();

  for (const id of campaignIds) {
    counters.set(id, { sent: 0, opened: 0, clicked: 0, open_rate: 0, ctr: 0 });
  }

  if (campaignIds.length === 0) {
    return counters;
  }

  const { data, error } = await supabase
    .from("email_logs")
    .select("campaign_id, sent_at, opened_at, clicked_at")
    .in("campaign_id", campaignIds);

  if (error) {
    console.error("[CAMPAIGN] getCampaignCounters error:", error);
    throw Object.assign(new Error("Failed to fetch campaign stats"), { statusCode: 500 });
  }

  for (const row of data ?? []) {
    const entry = counters.get(row.campaign_id);
    if (!entry) continue;
    if (row.sent_at) entry.sent += 1;
    if (row.opened_at) entry.opened += 1;
    if (row.clicked_at) entry.clicked += 1;
  }

  for (const entry of counters.values()) {
    entry.open_rate = entry.sent > 0 ? roundTo1dp((entry.opened / entry.sent) * 100) : 0;
    entry.ctr = entry.sent > 0 ? roundTo1dp((entry.clicked / entry.sent) * 100) : 0;
  }

  return counters;
};

export const createCampaign = async (data: CreateCampaignInput): Promise<Campaign> => {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      name: data.name,
      type: data.type,
      sent: data.sent,
      opened: data.opened,
      clicked: data.clicked,
      status: data.status,
      campaign_date: data.campaign_date,
    })
    .select()
    .single();

  if (error) {
    console.error("[CAMPAIGN] createCampaign error:", error);
    throw Object.assign(new Error("Failed to create campaign"), { statusCode: 500 });
  }

  return campaign as Campaign;
};

export const getCampaigns = async (
  page: number,
  limit: number,
): Promise<{ campaigns: CampaignWithStats[]; total: number }> => {
  const offset = (page - 1) * limit;

  const [result, countResult] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from("campaigns").select("id", { count: "exact", head: true }),
  ]);

  if (result.error) {
    console.error("[CAMPAIGN] getCampaigns error:", result.error);
    throw Object.assign(new Error("Failed to fetch campaigns"), { statusCode: 500 });
  }

  const campaigns = (result.data ?? []) as Campaign[];
  const counters = await getCampaignCounters(campaigns.map((c) => c.id));

  return {
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      ...counters.get(campaign.id)!,
    })),
    total: countResult.count ?? 0,
  };
};

export const getCampaignById = async (id: string): Promise<CampaignWithStats> => {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("[CAMPAIGN] getCampaignById error:", error);
    throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
  }

  const counters = await getCampaignCounters([id]);

  return { ...(data as Campaign), ...counters.get(id)! };
};

export const updateCampaign = async (id: string, data: UpdateCampaignInput): Promise<Campaign> => {
  const updates: Record<string, unknown> = {};

  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.sent !== undefined) updates.sent = data.sent;
  if (data.opened !== undefined) updates.opened = data.opened;
  if (data.clicked !== undefined) updates.clicked = data.clicked;
  if (data.status !== undefined) updates.status = data.status;
  if (data.campaign_date !== undefined) updates.campaign_date = data.campaign_date;

  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !campaign) {
    console.error("[CAMPAIGN] updateCampaign error:", error);
    throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
  }

  return campaign as Campaign;
};

export const deleteCampaign = async (id: string): Promise<void> => {
  const { error } = await supabase.from("campaigns").delete().eq("id", id);

  if (error) {
    console.error("[CAMPAIGN] deleteCampaign error:", error);
    throw Object.assign(new Error("Failed to delete campaign"), { statusCode: 500 });
  }
};

export const getCampaignStats = async (campaignId?: string): Promise<CampaignStats> => {
  const { data, error } = await supabase
    .from("email_logs")
    .select("sent_at, opened_at, clicked_at")
    .match(campaignId ? { campaign_id: campaignId } : {});

  if (error) {
    console.error("[CAMPAIGN] getCampaignStats error:", error);
    throw Object.assign(new Error("Failed to fetch campaign stats"), { statusCode: 500 });
  }

  const rows = data ?? [];
  const total_sent = rows.filter((row) => row.sent_at).length;
  const total_opens = rows.filter((row) => row.opened_at).length;
  const total_clicks = rows.filter((row) => row.clicked_at).length;
  const avg_ctr = total_sent > 0 ? Math.round((total_clicks / total_sent) * 1000) / 10 : 0;

  return { total_sent, total_opens, total_clicks, avg_ctr };
};
