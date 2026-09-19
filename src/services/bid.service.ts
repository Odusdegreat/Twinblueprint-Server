import { supabase } from "../config/supabase.ts";
import type { Bid } from "../types/bid.types.ts";
import type { CreateBidInput, UpdateBidInput } from "../validations/bid.validation.ts";
import { bidFinancialsNullableSchema } from "../validations/bid.validation.ts";

const parseFinancials = (input: unknown) => {
  const parsed = bidFinancialsNullableSchema.safeParse(input);
  if (!parsed.success) throw Object.assign(new Error("Bid amounts must be numeric and currencies must be valid ISO codes. Leave the amount blank when it has not been confirmed."), { statusCode: 400 });
  return parsed.data;
};

const validateLeadLink = async (leadId: string, excludeBidId?: string): Promise<void> => {
  const { data: lead, error: leadError } = await supabase.from("leads").select("id").eq("id", leadId).maybeSingle();
  if (leadError) throw Object.assign(new Error("Failed to validate linked lead"), { statusCode: 500 });
  if (!lead) throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
  let query = supabase.from("bids").select("id").eq("lead_id", leadId);
  if (excludeBidId) query = query.neq("id", excludeBidId);
  const { data: existing, error } = await query.limit(1);
  if (error) throw Object.assign(new Error("Failed to check linked bids"), { statusCode: 500 });
  if (existing?.length) throw Object.assign(new Error("This lead already has a bid. Update the existing bid instead."), { statusCode: 409 });
};

const bidWriteError = (error: { code?: string; message?: string }): Error => {
  if (["PGRST204", "42703"].includes(error.code ?? "") && error.message?.includes("currency")) {
    return Object.assign(new Error("Bid currency tracking is not installed. Apply scripts/bid-currency-migration.sql."), { statusCode: 503 });
  }
  return Object.assign(
  new Error(error.code === "23505" ? "This lead already has a bid. Update the existing bid instead." : error.code === "23503" ? "Linked lead not found" : "Failed to save bid"),
  { statusCode: error.code === "23505" ? 409 : error.code === "23503" ? 404 : 500 },
  );
};

export const createBid = async (data: CreateBidInput): Promise<Bid> => {
  const financials = parseFinancials(data);
  if (data.lead_id) await validateLeadLink(data.lead_id);
  const { data: bid, error } = await supabase
    .from("bids")
    .insert({
      project: data.project,
      client: data.client,
      phase: data.phase,
      deadline: data.deadline,
      suppliers: data.suppliers,
      value: financials.value ?? null,
      currency: financials.currency ?? null,
      lead_id: data.lead_id ?? null,
      status: data.status,
    })
    .select()
    .single();

  if (error) {
    console.error("[BID] createBid error:", error);
    throw bidWriteError(error);
  }

  return bid as Bid;
};

export const getBids = async (
  page: number,
  limit: number,
): Promise<{ bids: Bid[]; total: number }> => {
  const offset = (page - 1) * limit;

  const [result, countResult] = await Promise.all([
    supabase
      .from("bids")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from("bids").select("id", { count: "exact", head: true }),
  ]);

  if (result.error) {
    console.error("[BID] getBids error:", result.error);
    throw Object.assign(new Error("Failed to fetch bids"), { statusCode: 500 });
  }

  return {
    bids: (result.data ?? []) as Bid[],
    total: countResult.count ?? 0,
  };
};

export const getBidById = async (id: string): Promise<Bid> => {
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("[BID] getBidById error:", error);
    throw Object.assign(new Error("Bid not found"), { statusCode: 404 });
  }

  return data as Bid;
};

export const updateBid = async (id: string, data: UpdateBidInput): Promise<Bid> => {
  const financials = parseFinancials(data);
  if (data.lead_id) await validateLeadLink(data.lead_id, id);
  const updates: Record<string, unknown> = {};
  if (financials.value !== undefined) updates.value = financials.value;
  if (financials.currency !== undefined) updates.currency = financials.currency;

  if (data.project !== undefined) updates.project = data.project;
  if (data.client !== undefined) updates.client = data.client;
  if (data.phase !== undefined) updates.phase = data.phase;
  if (data.deadline !== undefined) updates.deadline = data.deadline;
  if (data.suppliers !== undefined) updates.suppliers = data.suppliers;
  if (data.lead_id !== undefined) updates.lead_id = data.lead_id;
  if (data.status !== undefined) updates.status = data.status;

  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  const { data: bid, error } = await supabase
    .from("bids")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !bid) {
    console.error("[BID] updateBid error:", error);
    if (error && error.code !== "PGRST116") throw bidWriteError(error);
    throw Object.assign(new Error("Bid not found"), { statusCode: 404 });
  }

  return bid as Bid;
};

export const deleteBid = async (id: string): Promise<void> => {
  const { error } = await supabase.from("bids").delete().eq("id", id);

  if (error) {
    console.error("[BID] deleteBid error:", error);
    throw Object.assign(new Error("Failed to delete bid"), { statusCode: 500 });
  }
};
