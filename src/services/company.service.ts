import { supabase } from "../config/supabase.ts";
import type { Company } from "../types/company.types.ts";
import type {
  CreateCompanyInput,
  UpdateCompanyInput,
} from "../validations/company.validation.ts";

export const createCompany = async (
  data: CreateCompanyInput,
): Promise<Company> => {
  const { data: company, error } = await supabase
    .from("companies")
    .insert({
      company_name: data.company_name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      website: data.website ?? null,
      industry: data.industry ?? null,
      address: data.address ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[COMPANY]", error);
    throw Object.assign(new Error("Failed to create company"), {
      statusCode: 500,
    });
  }

  return company as Company;
};

export const getCompanies = async (): Promise<Company[]> => {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw Object.assign(new Error("Failed to fetch companies"), {
      statusCode: 500,
    });
  }

  return (data ?? []) as Company[];
};

export const getCompanyById = async (id: string): Promise<Company> => {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw Object.assign(new Error("Company not found"), { statusCode: 404 });
  }

  return data as Company;
};

export const updateCompany = async (
  id: string,
  data: UpdateCompanyInput,
): Promise<Company> => {
  const updates: Record<string, unknown> = {};

  if (data.company_name !== undefined) updates.company_name = data.company_name;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.website !== undefined) updates.website = data.website;
  if (data.industry !== undefined) updates.industry = data.industry;
  if (data.address !== undefined) updates.address = data.address;

  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error("No fields to update"), {
      statusCode: 400,
    });
  }

  const { data: company, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !company) {
    throw Object.assign(new Error("Company not found"), { statusCode: 404 });
  }

  return company as Company;
};

export const deleteCompany = async (id: string): Promise<void> => {
  const { error } = await supabase.from("companies").delete().eq("id", id);

  if (error) {
    throw Object.assign(new Error("Failed to delete company"), {
      statusCode: 500,
    });
  }
};
