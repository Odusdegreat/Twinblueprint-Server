import { supabase } from "../config/supabase.ts";
import type { CreateDemoRequestDTO } from "../types/demo.types.ts";
import { enrichLeadLocation } from "./lead-enrichment.service.ts";

export const createDemoService = async (data: CreateDemoRequestDTO) => {
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("email", data.workEmail)
    .single();

  if (existing) {
    throw Object.assign(new Error("DUPLICATE_LEAD"), { statusCode: 409 });
  }

  const location = await enrichLeadLocation({ company: data.company });

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
      region_group: location.region_group,
      region: location.region,
      state: location.state,
      country: location.country,
    })
    .select()
    .single();

  if (error) {
    console.error("[DEMO] Failed to insert demo request:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    if (error.code === "23505") {
      throw Object.assign(new Error("A demo request already exists for this email"), {
        statusCode: 409,
      });
    }

    if (["PGRST204", "42703"].includes(error.code ?? "") && error.message.includes("industry")) {
      throw Object.assign(new Error("Demo requests require leads.industry. Apply scripts/leads-industry-migration.sql in the configured Supabase project."), { statusCode: 503 });
    }

    if (["PGRST204", "42703"].includes(error.code ?? "") && (error.message.includes("region_group") || error.message.includes("state"))) {
      throw Object.assign(new Error("Demo requests require leads.state and leads.region_group. Apply scripts/leads-state-region-group-migration.sql in the configured Supabase project."), { statusCode: 503 });
    }

    throw Object.assign(new Error("Failed to create demo request"), {
      statusCode: 500,
    });
  }

  return lead;
};
