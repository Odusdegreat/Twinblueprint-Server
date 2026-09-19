import { expect, mock, test } from "bun:test";
let leads: any[] = [];
let failure = false;
mock.module("../src/config/supabase.ts", () => ({ supabase: { from: () => ({ select: () => ({ eq: (key: string, value: unknown) => ({ order: () => ({ range: async (start: number, end: number) => ({ data: leads.filter(l => l[key] === value).slice(start, end + 1), error: failure ? { message: "unavailable" } : null }) }) }) }) }) } }));
const { getLeadsByApplication } = await import("../src/services/analytics.service.ts");
test("counts each non-archived lead once per application ignoring case and blanks", async () => {
  leads = [
    { archived: false, application_tools: ["Revit", " revit ", "REVIT", "AutoCAD", "", " ", null] },
    { archived: false, application_tools: ["REVIT", "autocad"] },
    { archived: false, application_tools: null },
    { archived: true, application_tools: ["Revit", "SketchUp"] },
  ];
  expect(await getLeadsByApplication()).toEqual([{ application: "AutoCAD", lead_count: 2 }, { application: "Revit", lead_count: 2 }]);
});
test("counts beyond one database page and sorts by count", async () => {
  leads = Array.from({ length: 1001 }, () => ({ archived: false, application_tools: ["Revit", "revit"] }));
  leads[1000].application_tools.push("AutoCAD");
  expect(await getLeadsByApplication()).toEqual([{ application: "Revit", lead_count: 1001 }, { application: "AutoCAD", lead_count: 1 }]);
});
test("empty input returns empty array and database failure is reported", async () => {
  leads = [];
  expect(await getLeadsByApplication()).toEqual([]);
  failure = true;
  await expect(getLeadsByApplication()).rejects.toMatchObject({ statusCode: 500 });
  failure = false;
});
