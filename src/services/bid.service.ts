import { supabase } from "../config/supabase.ts";
import type { Bid } from "../types/bid.types.ts";
import type { CreateBidInput, UpdateBidInput } from "../validations/bid.validation.ts";

export const createBid = async (data: CreateBidInput): Promise<Bid> => {
  const { data: bid, error } = await supabase
    .from("bids")
    .insert({
      project: data.project,
      client: data.client,
      phase: data.phase,
      deadline: data.deadline,
      suppliers: data.suppliers,
      value: data.value ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[BID] createBid error:", error);
    throw Object.assign(new Error("Failed to create bid"), { statusCode: 500 });
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
  const updates: Record<string, unknown> = {};

  if (data.project !== undefined) updates.project = data.project;
  if (data.client !== undefined) updates.client = data.client;
  if (data.phase !== undefined) updates.phase = data.phase;
  if (data.deadline !== undefined) updates.deadline = data.deadline;
  if (data.suppliers !== undefined) updates.suppliers = data.suppliers;
  if (data.value !== undefined) updates.value = data.value;

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
