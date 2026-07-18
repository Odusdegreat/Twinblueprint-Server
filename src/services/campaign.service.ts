import { supabase } from "../config/supabase.ts";
import type { Campaign, CampaignStats } from "../types/campaign.types.ts";
import type { CreateCampaignInput, UpdateCampaignInput } from "../validations/campaign.validation.ts";

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
      date: data.date,
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
): Promise<{ campaigns: Campaign[]; total: number }> => {
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

  return {
    campaigns: (result.data ?? []) as Campaign[],
    total: countResult.count ?? 0,
  };
};

export const getCampaignById = async (id: string): Promise<Campaign> => {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("[CAMPAIGN] getCampaignById error:", error);
    throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
  }

  return data as Campaign;
};

export const updateCampaign = async (id: string, data: UpdateCampaignInput): Promise<Campaign> => {
  const updates: Record<string, unknown> = {};

  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.sent !== undefined) updates.sent = data.sent;
  if (data.opened !== undefined) updates.opened = data.opened;
  if (data.clicked !== undefined) updates.clicked = data.clicked;
  if (data.status !== undefined) updates.status = data.status;
  if (data.date !== undefined) updates.date = data.date;

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

export const getCampaignStats = async (): Promise<CampaignStats> => {
  const { data, error } = await supabase
    .from("campaigns")
    .select("sent, opened, clicked");

  if (error) {
    console.error("[CAMPAIGN] getCampaignStats error:", error);
    throw Object.assign(new Error("Failed to fetch campaign stats"), { statusCode: 500 });
  }

  const rows = data ?? [];
  const total_sent = rows.reduce((sum, r) => sum + (r.sent ?? 0), 0);
  const total_opens = rows.reduce((sum, r) => sum + (r.opened ?? 0), 0);
  const total_clicks = rows.reduce((sum, r) => sum + (r.clicked ?? 0), 0);
  const avg_ctr = total_sent > 0 ? Math.round((total_clicks / total_sent) * 1000) / 10 : 0;

  return { total_sent, total_opens, total_clicks, avg_ctr };
};
