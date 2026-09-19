import { beforeEach, expect, mock, test } from "bun:test";
let linked: any[];
let saved: any;
let race = false;
const id = "a9cb07ef-2130-4b96-b657-6a415d1dea3e";
mock.module("../src/config/supabase.ts", () => ({ supabase: { from: (table: string) => ({ select: () => table === "leads"
  ? { ilike: () => ({ single: async () => ({ data: { id, project: "Project", company: "Vibely" }, error: null }) }) }
  : { eq: () => ({ limit: async () => ({ data: linked, error: null }) }) },
}) } }));
mock.module("../src/services/bid.service.ts", () => ({
  createBid: async (data: any) => { if (race) { linked = [{ id: "concurrent" }]; throw Object.assign(new Error("Duplicate"), { statusCode: 409 }); } saved = data; },
  updateBid: async (id: string, data: any) => { saved = { id, ...data }; },
}));
const { parseCsvBidDetails, importCsvBid } = await import("../src/services/lead-bid-import.service.ts");
const { updateBidSchema } = await import("../src/validations/bid.validation.ts");
beforeEach(() => { linked = []; saved = undefined; race = false; });
test("blank fields preserve values, null and empty array explicitly clear them", () => {
  expect(parseCsvBidDetails({ bid_value: "", suppliers: "" })).toBeUndefined();
  expect(parseCsvBidDetails({ bid_value: "null", suppliers: "[]" })).toEqual({ value: null, suppliers: [] });
  expect(parseCsvBidDetails({ bid_value: "0", suppliers: "A; B" })).toEqual({ value: 0, suppliers: ["A", "B"] });
  expect(() => parseCsvBidDetails({ bid_value: "$15M" })).toThrow();
  expect(() => parseCsvBidDetails({ suppliers: "[12]" })).toThrow();
});
test("existing bid needs no metadata and only supplied details change", async () => {
  linked = [{ id: "existing" }];
  expect(await importCsvBid("lead@example.com", {}, { value: 0 })).toBe("updated");
  expect(saved).toEqual({ id: "existing", value: 0 });
});
test("new bid uses explicit metadata and never uses project size as value", async () => {
  expect(await importCsvBid("lead@example.com", { bid_phase: "Shortlist", bid_deadline: "2026-12-01", project_size: "$800M-$900M" }, { suppliers: ["A"] })).toBe("created");
  expect(saved.lead_id).toBe(id);
  expect(saved.value).toBeUndefined();
  expect(saved.project).toBe("Project");
  expect(saved.client).toBe("Vibely");
  expect(saved.suppliers).toEqual(["A"]);
});
test("missing metadata and ambiguous links fail without writes", async () => {
  await expect(importCsvBid("lead@example.com", {}, { value: null })).rejects.toThrow("bid_phase");
  expect(saved).toBeUndefined();
  linked = [{ id: "one" }, { id: "two" }];
  await expect(importCsvBid("lead@example.com", {}, { value: 10 })).rejects.toThrow("Multiple bids");
});
test("concurrent creation updates the linked bid instead of duplicating it", async () => {
  race = true;
  expect(await importCsvBid("lead@example.com", { bid_phase: "Shortlist", bid_deadline: "2026-12-01" }, { value: 15000 })).toBe("updated");
  expect(saved).toEqual({ id: "concurrent", value: 15000 });
});

test("invalid CSV metadata identifies both fields without writing a bid", async () => {
  const operation = importCsvBid("lead@example.com", { bid_phase: "Active", bid_deadline: "12/9/2026" }, { value: 85000000 });
  await expect(operation).rejects.toThrow("bid_phase: Phase must be Discovery");
  await expect(operation).rejects.toThrow("bid_deadline: Deadline must be a valid date in YYYY-MM-DD");
  expect(saved).toBeUndefined();
});

test("deadlines reject impossible dates and accept leap days only in leap years", () => {
  for (const deadline of ["12/9/2026", "2026-02-29", "2026-04-31", "2026-13-01", "2026-12-09T00:00:00Z", ""]) {
    expect(updateBidSchema.safeParse({ deadline }).success).toBe(false);
  }
  for (const deadline of ["2026-12-09", "2028-02-29"]) expect(updateBidSchema.safeParse({ deadline }).success).toBe(true);
});
