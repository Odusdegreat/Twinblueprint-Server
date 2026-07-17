import { supabase } from "../config/supabase.ts";
import type { CreateDemoRequestDTO } from "../types/demo.types.ts";

export const createDemoService = async (data: CreateDemoRequestDTO) => {
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("email", data.workEmail)
    .single();

  if (existing) {
    throw Object.assign(new Error("DUPLICATE_LEAD"), { statusCode: 409 });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      full_name: data.fullName,
      email: data.workEmail,
      company: data.company,
      job_title: data.jobTitle,
      phone: data.phone,
      industry: data.industry,
      status: "new",
    })
    .select()
    .single();

  if (error) {
    throw Object.assign(new Error("Failed to create demo request"), {
      statusCode: 500,
    });
  }

  return lead;
};
