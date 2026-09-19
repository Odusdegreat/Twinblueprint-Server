import { supabase } from "../config/supabase.ts";
import { createBid, updateBid } from "./bid.service.ts";
import { createBidSchema, bidFinancialsNullableSchema } from "../validations/bid.validation.ts";
import { currencySchema } from "../config/currencies.ts";

export interface CsvBidDetails {
  value?: number | null;
  currency?: string;
  suppliers?: string[];
}

export const parseCsvBidDetails = (row: Record<string, string>): CsvBidDetails | undefined => {
  const amount = row.bid_value?.trim();
  const names = row.suppliers?.trim();
  const currency = row.bid_currency?.trim();
  if (!amount && !names && !currency) return undefined;
  const details: CsvBidDetails = {};
  if (currency) {
    const parsedCurrency = currencySchema.safeParse(currency);
    if (!parsedCurrency.success) throw new Error("bid_currency must be a valid ISO currency code");
    details.currency = parsedCurrency.data;
  }
  if (amount) {
    if (amount === "null") {
      details.value = null;
    } else {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount) || !Number.isFinite(Number(amount))) {
        throw new Error("bid_value must be a finite number without currency symbols or separators; use null to mark it as unconfirmed");
      }
      details.value = Number(amount);
    }
  }
  if (names) {
    if (names.startsWith("[")) {
      let parsed: unknown;
      try { parsed = JSON.parse(names); } catch { throw new Error("suppliers must be a JSON array or semicolon-separated names"); }
      if (!Array.isArray(parsed) || !parsed.every(name => typeof name === "string" && name.trim())) {
        throw new Error("suppliers must contain supplier names only");
      }
      details.suppliers = parsed.map(name => name.trim());
    } else {
      details.suppliers = names.split(";").map(name => name.trim()).filter(Boolean);
      if (!details.suppliers.length) throw new Error("Use [] to clear suppliers");
    }
  }
  return details;
};

export const importCsvBid = async (email: string, row: Record<string, string>, details: CsvBidDetails): Promise<"created" | "updated"> => {
  const financials = bidFinancialsNullableSchema.safeParse(details);
  if (!financials.success) throw new Error("bid_value must be a number or null, and bid_currency must be a valid ISO currency code");
  const { data: lead, error } = await supabase.from("leads").select("id,project,company")
    .ilike("email", email.replace(/[_%]/g, "\\$&")).single();
  if (error || !lead) throw new Error("Could not identify the lead for bid details");
  const findBid = async () => {
    const result = await supabase.from("bids").select("id").eq("lead_id", lead.id).limit(2);
    if (result.error) throw new Error("Failed to find linked bid");
    if ((result.data?.length ?? 0) > 1) throw new Error("Multiple bids are linked to this lead; resolve duplicates before importing");
    return result.data?.[0];
  };
  const existing = await findBid();
  if (existing) {
    await updateBid(existing.id, details);
    return "updated";
  }
  const parsed = createBidSchema.safeParse({
    lead_id: lead.id,
    project: row.bid_project || lead.project || undefined,
    client: row.bid_client || lead.company || undefined,
    phase: row.bid_phase || undefined,
    deadline: row.bid_deadline || undefined,
    ...details,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = { phase: "bid_phase", deadline: "bid_deadline", project: "bid_project (or lead project)", client: "bid_client (or lead company)" };
    throw new Error(parsed.error.issues.map(issue => {
      const key = String(issue.path[0] ?? "bid");
      return `${fields[key] ?? key}: ${issue.message}`;
    }).join("; "));
  }
  try {
    await createBid(parsed.data);
    return "created";
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 409) throw error;
    const concurrent = await findBid();
    if (!concurrent) throw error;
    await updateBid(concurrent.id, details);
    return "updated";
  }
};
