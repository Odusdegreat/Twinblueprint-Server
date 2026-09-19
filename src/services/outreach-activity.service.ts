import { supabase } from "../config/supabase.ts";

const missingSchema = (code?: string) => ["42P01", "42703", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code ?? "");
const databaseError = (error: { code?: string; message: string }, context: string) => {
  console.error(`[OUTREACH] ${context}`, { code: error.code, message: error.message });
  if (missingSchema(error.code)) return Object.assign(new Error("Outreach activity tracking is not installed. Apply scripts/outreach-activity-migration.sql in the configured Supabase project."), { statusCode: 503 });
  const statusCode = error.code === "23503" || error.code === "P0002" ? 404 : ["23505", "P0001"].includes(error.code ?? "") ? 409 : error.code === "22023" ? 400 : 500;
  return Object.assign(new Error(statusCode === 500 ? context : error.message), { statusCode });
};

const reasonForUnavailable = (availability: Record<string, boolean>): string | null => {
  const reasons: string[] = [];
  if (!availability.linkedin_sent) reasons.push("LinkedIn sent requires the outreach sequence schema. Apply scripts/outreach-sequences-migration.sql.");
  if (!availability.response_rate) reasons.push("Response rate requires sequence contact tracking and reply tracking. Apply scripts/outreach-sequences-migration.sql and scripts/outreach-activity-migration.sql.");
  if (!availability.meetings_booked) reasons.push("Meetings booked requires outreach activity tracking. Apply scripts/outreach-activity-migration.sql.");
  return reasons.length ? reasons.join(" ") : null;
};

export const getOutreachStats = async (input: { start?: string; end?: string }) => {
  const end = new Date(input.end ?? Date.now());
  const start = input.start ? new Date(input.start) : new Date(end.getTime() - 30 * 86400000);
  const period = { start: start.toISOString(), end: end.toISOString(), timezone: "UTC", bounds: "rolling" };
  const { data, error } = await supabase.rpc("get_outreach_stats", { p_start: period.start, p_end: period.end }).abortSignal(AbortSignal.timeout(30000));
  if (error && !missingSchema(error.code)) throw databaseError(error, "Failed to retrieve Outreach stats");
  const metrics = error ? {
    linkedin_sent: null, response_rate: null, meetings_booked: null,
    response_rate_numerator: null, response_rate_denominator: null,
    availability: { linkedin_sent: false, response_rate: false, meetings_booked: false },
    unavailable_reason: "Outreach stats schema is unavailable. Apply scripts/outreach-activity-migration.sql.",
    sequence_schema_ready: null,
  } : (data ?? {});
  const availability = metrics.availability ?? { linkedin_sent: false, response_rate: false, meetings_booked: false };
  const unavailable_reason = metrics.unavailable_reason ?? reasonForUnavailable(availability);
  return { ...metrics, availability, period, unavailable_reason, scheduler_enabled: process.env.OUTREACH_SCHEDULER_ENABLED === "true" };
};

export const recordOutreachActivity = async (kind: "reply" | "meeting", input: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(`record_outreach_${kind}`, { p_input: input }).abortSignal(AbortSignal.timeout(30000));
  if (error) throw databaseError(error, `Failed to record Outreach ${kind}`);
  return data;
};

export const listOutreachActivity = async (kind: "replies" | "meetings", leadId: string, page: number, limit: number) => {
  const { data, count, error } = await supabase.from(`outreach_${kind}`).select("*", { count: "exact" })
    .eq("lead_id", leadId).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (error) throw databaseError(error, `Failed to retrieve Outreach ${kind}`);
  return { [kind]: data ?? [], pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) } };
};

export const updateOutreachMeeting = async (id: string, input: Record<string, unknown>) => {
  const { data, error } = await supabase.from("outreach_meetings").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).select().maybeSingle();
  if (error) throw databaseError(error, "Failed to update Outreach meeting");
  if (!data) throw Object.assign(new Error("Outreach meeting not found"), { statusCode: 404 });
  return data;
};
