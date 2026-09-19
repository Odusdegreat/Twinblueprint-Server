import { Resend } from "resend";
import { supabase } from "../config/supabase.ts";
import { env } from "../config/env.config.ts";

const resend = new Resend(env.RESEND_API_KEY);

interface OutreachInput { lead_id: string; campaign_id?: string | null; subject: string; template: string }
export const personalise = (template: string, lead: Record<string, unknown>) => template
  .replaceAll("{{full_name}}", String(lead.full_name ?? ""))
  .replaceAll("{{company}}", String(lead.company ?? ""))
  .replaceAll("{{project}}", String(lead.project ?? ""));

export const getLead = async (id: string) => {
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
  if (error || !data) throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
  return data as Record<string, unknown>;
};

export const preview = async (input: OutreachInput) => {
  const lead = await getLead(input.lead_id);
  return { recipient: lead.email, subject: personalise(input.subject, lead), html: personalise(input.template, lead) };
};

export const send = async (input: OutreachInput) => {
  if (!env.RESEND_API_KEY) throw Object.assign(new Error("Email delivery is not configured"), { statusCode: 503 });
  const message = await preview(input);
  const { data, error } = await resend.emails.send({ from: env.FROM_EMAIL, to: String(message.recipient), subject: message.subject, html: message.html });
  if (error) throw Object.assign(new Error(error.message), { statusCode: 502 });
  const { data: log, error: logError } = await supabase.from("email_logs").insert({
    resend_email_id: data?.id ?? null, lead_id: input.lead_id, campaign_id: input.campaign_id ?? null,
    recipient: message.recipient, subject: message.subject, channel: "email", template: input.template, status: "sent", sent_at: new Date().toISOString(),
  }).select().single();
  if (logError) throw Object.assign(new Error("Email sent but logging failed"), { statusCode: 500 });
  return log;
};

export const getMessages = async (page: number, limit: number) => {
  const offset = (page - 1) * limit;
  const [result, countResult] = await Promise.all([
    supabase.from("email_logs").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1),
    supabase.from("email_logs").select("id", { count: "exact", head: true }),
  ]);
  if (result.error) throw Object.assign(new Error("Failed to fetch outreach messages"), { statusCode: 500 });
  return { messages: result.data ?? [], total: countResult.count ?? 0 };
};

export const processWebhook = async (event: { type: string; data: { email_id?: string; created_at?: string } }) => {
  const columnByEvent: Record<string, { status: string; column?: string }> = {
    "email.sent": { status: "sent", column: "sent_at" }, "email.delivered": { status: "delivered", column: "delivered_at" },
    "email.opened": { status: "opened", column: "opened_at" }, "email.clicked": { status: "clicked", column: "clicked_at" },
    "email.bounced": { status: "bounced", column: "bounced_at" }, "email.failed": { status: "failed" },
  };
  const update = columnByEvent[event.type];
  if (!update || !event.data.email_id) return;
  const values: Record<string, string> = { status: update.status, updated_at: new Date().toISOString() };
  if (update.column) values[update.column] = event.data.created_at ?? new Date().toISOString();
  const { error } = await supabase.from("email_logs").update(values).eq("resend_email_id", event.data.email_id);
  if (error) throw Object.assign(new Error("Failed to update email event"), { statusCode: 500 });
};
