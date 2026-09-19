import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";

let result: { data: any; error: { code: string; message: string } | null; count: number | null };
const query: any = {
  select: () => query, eq: () => query, order: () => query, range: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result),
};
mock.module("../src/config/supabase.ts", () => ({ supabase: {
  from: () => query,
  rpc: () => ({ abortSignal: () => Promise.resolve(result) }),
} }));
mock.module("../src/services/outreach.service.ts", () => ({ getLead: async () => ({}), personalise: (value: string) => value }));
const { listSequences, getSequence, sequenceRpc } = await import("../src/services/sequence.service.ts");
const errorLog = spyOn(console, "error").mockImplementation(() => {});
beforeEach(() => { result = { data: [], error: null, count: 0 }; errorLog.mockClear(); });
afterAll(() => errorLog.mockRestore());

test("missing sequence table returns actionable 503 instead of generic 500", async () => {
  result.error = { code: "PGRST205", message: "Could not find the table public.outreach_sequences in the schema cache" };
  await expect(listSequences("lead", 1, 20)).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining("outreach-sequences-migration.sql") });
  expect(errorLog).toHaveBeenCalledWith("[SEQUENCES] Failed to list sequences", result.error);
});
test("partial migrations and missing RPCs have the same deployment guidance", async () => {
  for (const code of ["42P01", "42703", "PGRST200", "PGRST202", "PGRST204"]) {
    result.error = { code, message: "Schema incomplete" };
    await expect(getSequence("sequence")).rejects.toMatchObject({ statusCode: 503 });
    await expect(sequenceRpc("start_outreach_sequence", {})).rejects.toMatchObject({ statusCode: 503 });
  }
});
test("permissions and other failures are not misreported as missing migrations", async () => {
  result.error = { code: "42501", message: "Permission denied for table outreach_sequences" };
  await expect(listSequences("lead", 1, 20)).rejects.toMatchObject({ statusCode: 500, message: "Failed to list sequences" });
  expect(errorLog).toHaveBeenCalledWith("[SEQUENCES] Failed to list sequences", result.error);
});
test("an installed empty table returns a successful empty result", async () => {
  expect(await listSequences("lead", 1, 20)).toEqual({ sequences: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
});
test("missing records and state conflicts retain their API status codes", async () => {
  result.data = null;
  await expect(getSequence("sequence")).rejects.toMatchObject({ statusCode: 404 });
  result.error = { code: "P0001", message: "Sequence is no longer active" };
  await expect(sequenceRpc("change_outreach_sequence", {})).rejects.toMatchObject({ statusCode: 409, message: "Sequence is no longer active" });
});
