import { expect, mock, test } from "bun:test";
let projects: any[] = [];
mock.module("../src/config/supabase.ts", () => ({ supabase: { from(table: string) {
  let changes: any;
  let inserting = false;
  let id: string | undefined;
  const rows = () => table === "projects" ? projects.filter(p => !id || p.id === id) : [];
  const q: any = {
    select: () => q, order: () => q, eq: (key: string, value: string) => { if (key === "id") id = value; return q; },
    insert: (data: any) => { changes = data; inserting = true; return q; },
    update: (data: any) => { changes = data; return q; },
    single: async () => {
      if (inserting) projects.push({ id: "project-id", created_at: "2026-09-08", ...changes });
      else rows().forEach(p => Object.assign(p, changes));
      return { data: rows()[0], error: null };
    },
    then: (resolve: any, reject: any) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
  }; return q;
} } }));
const { createProjectSchema, updateProjectSchema } = await import("../src/validations/project.validation.ts");
const { createProject, updateProject } = await import("../src/services/project.service.ts");
const { getPipeline } = await import("../src/services/pipeline.service.ts");

test("saved project fields and status changes are reflected in pipeline", async () => {
  projects = [];
  const input = createProjectSchema.parse({ project: "Office", client: "Client", start_date: "2026-09-01", end_date: "2027-03-31", progress: 25, suppliers: ["A", "B"], uses_3d: true, competitor: "Competitor", issue: "Delivery", status: "In-flight", phase: "Design", value: 180000000, currency: "USD" });
  const created = await createProject(input);
  let pipeline = await getPipeline();
  expect(pipeline.inflight_projects[0]).toMatchObject(input);
  expect(pipeline.summary.total_projects).toBe(1);
  await updateProject(created.id, updateProjectSchema.parse({ progress: 0, suppliers: [], uses_3d: false, issue: null, competitor: null }));
  pipeline = await getPipeline();
  expect(pipeline.inflight_projects[0]).toMatchObject({ progress: 0, suppliers: [], uses_3d: false, issue: null, competitor: null, status: "In-flight" });
  for (const status of ["Active", "On Hold", "Completed", "Cancelled"]) {
    await updateProject(created.id, updateProjectSchema.parse({ status }));
    expect((await getPipeline()).inflight_projects).toEqual([]);
  }
  await updateProject(created.id, { status: "In-flight", progress: 100 });
  expect((await getPipeline()).inflight_projects[0]?.progress).toBe(100);
});

test("status is constrained and progress boundaries are enforced", () => {
  for (const progress of [-1, 101]) expect(updateProjectSchema.safeParse({ progress }).success).toBe(false);
  expect(updateProjectSchema.safeParse({ status: "unknown" }).success).toBe(false);
  expect(updateProjectSchema.safeParse({ phase: "Technical Eval" }).success).toBe(false);
  for (const phase of ["Planning", "Design", "Construction", "In Progress", "Completed"]) {
    expect(updateProjectSchema.safeParse({ phase }).success).toBe(true);
  }
  for (const progress of [0, 100]) expect(updateProjectSchema.safeParse({ progress }).success).toBe(true);
});
