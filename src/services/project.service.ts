import { supabase } from "../config/supabase.ts";
import type { Project } from "../types/project.types.ts";
import type { CreateProjectInput, UpdateProjectInput } from "../validations/project.validation.ts";

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
