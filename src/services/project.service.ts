import { supabase } from "../config/supabase.ts";
import type { Project } from "../types/project.types.ts";
import type { CreateProjectInput, UpdateProjectInput } from "../validations/project.validation.ts";

const fail = (message: string, statusCode = 500) => Object.assign(new Error(message), { statusCode });

export const createProject = async (data: CreateProjectInput): Promise<Project> => {
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      project: data.project,
      client: data.client,
      start_date: data.start_date,
      end_date: data.end_date,
      progress: data.progress,
      suppliers: data.suppliers,
      uses_3d: data.uses_3d,
      competitor: data.competitor ?? null,
      issue: data.issue ?? null,
      bid_id: data.bid_id ?? null,
      status: data.status,
      phase: data.phase,
      value: data.value ?? null,
      currency: data.currency ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[PROJECT] createProject error:", error);
    throw Object.assign(new Error("Failed to create project"), { statusCode: 500 });
  }

  return project as Project;
};

export const getProjects = async (
  page: number,
  limit: number,
): Promise<{ projects: Project[]; total: number }> => {
  const offset = (page - 1) * limit;

  const [result, countResult] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from("projects").select("id", { count: "exact", head: true }),
  ]);

  if (result.error) {
    console.error("[PROJECT] getProjects error:", result.error);
    throw Object.assign(new Error("Failed to fetch projects"), { statusCode: 500 });
  }

  return {
    projects: (result.data ?? []) as Project[],
    total: countResult.count ?? 0,
  };
};

export const getProjectById = async (id: string): Promise<Project> => {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("[PROJECT] getProjectById error:", error);
    throw Object.assign(new Error("Project not found"), { statusCode: 404 });
  }

  return data as Project;
};

export const updateProject = async (id: string, data: UpdateProjectInput): Promise<Project> => {
  const updates: Record<string, unknown> = {};

  if (data.project !== undefined) updates.project = data.project;
  if (data.client !== undefined) updates.client = data.client;
  if (data.start_date !== undefined) updates.start_date = data.start_date;
  if (data.end_date !== undefined) updates.end_date = data.end_date;
  if (data.progress !== undefined) updates.progress = data.progress;
  if (data.suppliers !== undefined) updates.suppliers = data.suppliers;
  if (data.uses_3d !== undefined) updates.uses_3d = data.uses_3d;
  if (data.competitor !== undefined) updates.competitor = data.competitor;
  if (data.issue !== undefined) updates.issue = data.issue;
  if (data.bid_id !== undefined) updates.bid_id = data.bid_id;
  if (data.status !== undefined) updates.status = data.status;
  if (data.phase !== undefined) updates.phase = data.phase;
  if (data.value !== undefined) updates.value = data.value;
  if (data.currency !== undefined) updates.currency = data.currency;

  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error("No fields to update"), { statusCode: 400 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !project) {
    console.error("[PROJECT] updateProject error:", error);
    throw Object.assign(new Error("Project not found"), { statusCode: 404 });
  }

  return project as Project;
};

export const deleteProject = async (id: string): Promise<void> => {
  const { error } = await supabase.from("projects").delete().eq("id", id);

  if (error) {
    console.error("[PROJECT] deleteProject error:", error);
    throw Object.assign(new Error("Failed to delete project"), { statusCode: 500 });
  }
};

const ensureProject = async (id: string) => {
  const { data, error } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (error) throw fail("Failed to fetch project");
  if (!data) throw fail("Project not found", 404);
};

const ensureSupplier = async (id: string) => {
  const { data, error } = await supabase.from("suppliers").select("id").eq("id", id).maybeSingle();
  if (error) throw fail("Failed to fetch supplier");
  if (!data) throw fail("Supplier not found", 404);
};

export const linkProjectSupplier = async (projectId: string, supplierId: string, remove = false) => {
  await ensureProject(projectId);
  await ensureSupplier(supplierId);
  const result = remove
    ? await supabase.from("project_suppliers").delete().eq("project_id", projectId).eq("supplier_id", supplierId)
    : await supabase.from("project_suppliers").upsert({ project_id: projectId, supplier_id: supplierId }, { onConflict: "project_id,supplier_id" });
  if (result.error) {
    console.error("[PROJECT] project supplier link error:", result.error);
    const statusCode = result.error.code === "23503" ? 404 : 500;
    const message = result.error.code === "23503"
      ? "Project or supplier not found"
      : ["PGRST205", "PGRST200", "42P01"].includes(result.error.code ?? "")
        ? "Project supplier migration has not been applied; run scripts/supplier-migration.sql and reload the Supabase schema"
        : result.error.code === "42501"
          ? "Project supplier link permission denied; check service-role database grants"
          : "Failed to save project supplier link";
    throw fail(message, statusCode);
  }
};
