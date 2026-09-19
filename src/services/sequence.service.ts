import { supabase } from "../config/supabase.ts";
import { getLead, personalise } from "./outreach.service.ts";
import type { z } from "zod/v4";
import type { startSequenceSchema } from "../validations/sequence.validation.ts";

const sequenceDatabaseError = (error: { code?: string; message: string }, context: string) => {
  console.error(`[SEQUENCES] ${context}`, { code: error.code, message: error.message });
  if (["42P01", "42703", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
    return Object.assign(new Error("Outreach sequence database schema is not ready. Apply scripts/outreach-sequences-migration.sql after the CRM migration in the configured Supabase project, then reload the schema cache."), { statusCode: 503 });
  }
  const statusCode = error.code === "P0002" ? 404 : ["23505", "P0001"].includes(error.code ?? "") ? 409 : error.code === "22023" ? 400 : 500;
  return Object.assign(new Error(statusCode === 500 ? context : error.message), { statusCode });
};

export const sequenceRpc = async (name: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(30000));
  if (error) throw sequenceDatabaseError(error, "Sequence operation failed");
  return data;
};

export const startSequence = async (input: z.infer<typeof startSequenceSchema>) => {
  const lead = await getLead(input.lead_id);
  const start = new Date(input.start_at ?? Date.now());
  const offsets = [0, 3, 7, 14];
  const steps = input.steps.map((step, index) => ({
    position: index + 1, channel: step.channel,
    due_at: new Date(start.getTime() + offsets[index]! * 86400000).toISOString(),
    message: personalise(step.message, lead), subject: step.subject ? personalise(step.subject, lead) : null,
  }));
  const id = await sequenceRpc("start_outreach_sequence", { p_lead_id: input.lead_id, p_start_at: start.toISOString(), p_steps: steps });
  return getSequence(id);
};

export const getSequence = async (id: string) => {
  const { data, error } = await supabase.from("outreach_sequences")
    .select("*, steps:outreach_sequence_steps(*, sent_email:email_logs(*), attempts:outreach_sequence_attempts(*))")
    .eq("id", id).maybeSingle();
  if (error) throw sequenceDatabaseError(error, "Failed to retrieve sequence");
  if (!data) throw Object.assign(new Error("Sequence not found"), { statusCode: 404 });
  data.steps.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
  for (const step of data.steps) step.attempts.sort((a: { attempt: number }, b: { attempt: number }) => a.attempt - b.attempt);
  return data;
};

export const listSequences = async (leadId: string, page: number, limit: number) => {
  const { data, error, count } = await supabase.from("outreach_sequences").select("*", { count: "exact" })
    .eq("lead_id", leadId).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (error) throw sequenceDatabaseError(error, "Failed to list sequences");
  return { sequences: data, pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) } };
};

export const changeSequence = async (sequenceId: string, action: string, input: Record<string, unknown>, stepId?: string) => {
  await sequenceRpc("change_outreach_sequence", { p_sequence_id: sequenceId, p_action: action, p_input: input, p_step_id: stepId ?? null });
  return getSequence(sequenceId);
};
