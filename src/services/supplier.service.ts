import { supabase } from "../config/supabase.ts";
import type { Bid } from "../types/bid.types.ts";
import type { Supplier } from "../validations/supplier.validation.ts";
import { enrichSuppliers } from "./supplier-intelligence.service.ts";

const fail = (message: string, statusCode = 500) => Object.assign(new Error(message), { statusCode });
export const saveSupplier = async (data: Partial<Omit<Supplier, "id">>, id?: string) => {
  const query = id ? supabase.from("suppliers").update(data).eq("id", id) : supabase.from("suppliers").insert(data);
  const result = await query.select().single();
  if (result.error || !result.data) throw fail(result.error?.code === "PGRST116" ? "Supplier not found" : "Failed to save supplier", result.error?.code === "PGRST116" ? 404 : 500);
  return result.data as Supplier;
};
const getSupplierProfile = async (id: string) => {
  const { data, error } = await supabase.from("suppliers").select().eq("id", id).maybeSingle();
  if (error) throw fail("Failed to fetch supplier");
  if (!data) throw fail("Supplier not found", 404);
  return data as Supplier;
};
export const getSupplier = async (id: string) => {
  const profile = await getSupplierProfile(id);
  return (await enrichSuppliers([profile], true))[0]!;
};
export const listSuppliers = async (page: number, limit: number) => {
  const { data, count, error } = await supabase.from("suppliers").select("*", { count: "exact" }).order("name").order("id").range((page - 1) * limit, page * limit - 1);
  if (error) throw fail("Failed to fetch suppliers");
  return { suppliers: await enrichSuppliers((data ?? []) as Supplier[], true), pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) } };
};
export const linkSupplier = async (bidId: string, supplierId: string, remove = false) => {
  const { data: bid, error } = await supabase.from("bids").select("id").eq("id", bidId).maybeSingle();
  if (error) throw fail("Failed to fetch bid");
  if (!bid) throw fail("Bid not found", 404);
  await getSupplierProfile(supplierId);
  const result = remove
    ? await supabase.from("bid_suppliers").delete().eq("bid_id", bidId).eq("supplier_id", supplierId)
    : await supabase.from("bid_suppliers").upsert({ bid_id: bidId, supplier_id: supplierId }, { onConflict: "bid_id,supplier_id" });
  if (result.error) throw fail("Failed to save bid supplier link", result.error.code === "23503" ? 404 : 500);
};

export const enrichBidSuppliers = async (bids: Bid[]): Promise<Array<Bid & { supplier_details: Supplier[] }>> => {
  const byBid = new Map<string, Supplier[]>();
  for (let start = 0; start < bids.length; start += 100) {
    const ids = bids.slice(start, start + 100).map(bid => bid.id);
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await supabase.from("bid_suppliers").select("bid_id,supplier_id,supplier:suppliers(*)")
        .in("bid_id", ids).order("bid_id").order("supplier_id").range(offset, offset + 199);
      if (error) {
        if (["PGRST205", "PGRST200", "42P01"].includes(error.code)) {
          console.warn("[SUPPLIERS] Supplier schema unavailable; apply scripts/supplier-migration.sql and reload the schema cache.");
          return bids.map(bid => ({ ...bid, supplier_details: [] }));
        }
        console.error("[SUPPLIERS] Bid supplier lookup failed:", error);
        throw fail("Failed to fetch bid supplier details");
      }
      for (const row of data ?? []) {
        const supplier = row.supplier as unknown as Supplier | null;
        if (supplier) byBid.set(row.bid_id, [...(byBid.get(row.bid_id) ?? []), supplier]);
      }
      if ((data?.length ?? 0) < 200) break;
    }
  }
  return bids.map(bid => {
    const supplier_details = byBid.get(bid.id) ?? [];
    return { ...bid, suppliers: [...new Set([...(bid.suppliers ?? []), ...supplier_details.map(s => s.name)])], supplier_details };
  });
};
