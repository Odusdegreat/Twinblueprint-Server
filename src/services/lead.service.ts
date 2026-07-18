import { supabase } from "../config/supabase.ts";
import type { Lead } from "../types/lead.types.ts";
import type { CreateLeadInput, UpdateLeadInput } from "../validations/lead.validation.ts";

export const createLead = async (data: CreateLeadInput): Promise<Lead> => {
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      full_name: data.full_name,
      email: data.email,
      company: data.company ?? null,
      job_title: data.job_title ?? null,
      phone: data.phone ?? null,
      category: data.category ?? null,
      applications: data.applications,
      score: data.score,
      status: "new",
    })
    .select()
    .single();

  if (error) {
    console.error("[LEAD] createLead error:", error);
    throw Object.assign(new Error("Failed to create lead"), {
      statusCode: 500,
    });
  }

  return lead as Lead;
};

export const getLeads = async (
  page: number,
  limit: number,
): Promise<{ leads: Lead[]; total: number }> => {
  const offset = (page - 1) * limit;

  const [result, countResult] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from("leads").select("id", { count: "exact", head: true }),
  ]);

  if (result.error) {
    console.error("[LEAD] getLeads error:", result.error);
    throw Object.assign(new Error("Failed to fetch leads"), {
      statusCode: 500,
    });
  }

  return {
    leads: (result.data ?? []) as Lead[],
    total: countResult.count ?? 0,
  };
};

export const getLeadById = async (id: string): Promise<Lead> => {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("[LEAD] getLeadById error:", error);
    throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
  }

  return data as Lead;
};

export const updateLead = async (
  id: string,
  data: UpdateLeadInput,
): Promise<Lead> => {
  const updates: Record<string, unknown> = {};

  if (data.full_name !== undefined) updates.full_name = data.full_name;
  if (data.email !== undefined) updates.email = data.email;
  if (data.company !== undefined) updates.company = data.company;
  if (data.job_title !== undefined) updates.job_title = data.job_title;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.category !== undefined) updates.category = data.category;
  if (data.applications !== undefined) updates.applications = data.applications;
  if (data.score !== undefined) updates.score = data.score;
  if (data.status !== undefined) updates.status = data.status;

  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !lead) {
    console.error("[LEAD] updateLead error:", error);
    throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
  }

  return lead as Lead;
};

export const deleteLead = async (id: string): Promise<void> => {
  const { error } = await supabase.from("leads").delete().eq("id", id);

  if (error) {
    console.error("[LEAD] deleteLead error:", error);
    throw Object.assign(new Error("Failed to delete lead"), {
      statusCode: 500,
    });
  }
};

export const assignLead = async (
  id: string,
  assignedTo: string,
): Promise<Lead> => {
  const { data: lead, error } = await supabase
    .from("leads")
    .update({ assigned_to: assignedTo })
    .eq("id", id)
    .select()
    .single();

  if (error || !lead) {
    console.error("[LEAD] assignLead error:", error);
    throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
  }

  return lead as Lead;
};
