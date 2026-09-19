import { expect, mock, test } from "bun:test";
import { parse } from "csv-parse/sync";
let bids: any[] = [];
let fail = false;
mock.module("../src/config/supabase.ts", () => ({ supabase: { from: () => ({ select: () => ({ in: (_key: string, ids: string[]) => ({ order: () => ({ range: async (start: number, end: number) => ({ data: bids.filter(b => ids.includes(b.lead_id)).slice(start, end + 1), error: fail ? { message: "offline" } : null }) }) }) }) }) } }));
const { leadsToCsv } = await import("../src/services/lead.service.ts");
const { parseCsvBidDetails } = await import("../src/services/lead-bid-import.service.ts");
const lead = (id: string) => ({ id, full_name: "Example Person", email: `${id}@example.com`, project_size: "$800M-$900M", project_value: 800000000, currency: "USD", application_tools: [] }) as any;

test("exports project_value and currency columns alongside project_size", async () => {
  const rows = parse(await leadsToCsv([lead("one")]), { columns: true });
  expect(rows[0].project_size).toBe("$800M-$900M");
  expect(rows[0].project_value).toBe("800000000");
  expect(rows[0].currency).toBe("USD");
});

test("exports the country column alongside region", async () => {
  const rows = parse(await leadsToCsv([{ ...lead("one"), region: "UK & Ireland", country: "United Kingdom" }]), { columns: true });
  expect(rows[0].region).toBe("UK & Ireland");
  expect(rows[0].country).toBe("United Kingdom");
});

test("exports bid fields and round-trips zero and punctuation in suppliers", async () => {
  bids = [{ id: "bid", lead_id: "one", value: 0, suppliers: ['A; B', 'C, "D"'], phase: "Shortlist", deadline: "2026-12-01", project: "Bid project", client: "Client", status: "Won" }];
  const rows = parse(await leadsToCsv([lead("one"), lead("two")]), { columns: true });
  expect(rows[0].project_size).toBe("$800M-$900M");
  expect(rows[0].bid_value).toBe("0");
  expect(rows[0].bid_project).toBe("Bid project");
  expect(rows[0].bid_deadline).toBe("2026-12-01");
  expect(parseCsvBidDetails(rows[0])).toEqual({ value: 0, suppliers: ['A; B', 'C, "D"'] });
  expect(rows[1].bid_value).toBe("");
  expect(parseCsvBidDetails(rows[1])).toBeUndefined();
});

test("unknown bid details export as explicit null and empty array", async () => {
  bids = [{ id: "bid", lead_id: "one", value: null, suppliers: [] }];
  const [row] = parse(await leadsToCsv([lead("one")]), { columns: true });
  expect(parseCsvBidDetails(row)).toEqual({ value: null, suppliers: [] });
});

test("empty export retains new headers", async () => {
  expect(await leadsToCsv([])).toContain("bid_value,suppliers,bid_phase,bid_deadline,bid_project,bid_client");
});

test("multiple linked bids export as separate identified rows", async () => {
  bids = [{ id: "one", lead_id: "one", value: 0 }, { id: "two", lead_id: "one", value: 15000 }];
  const rows = parse(await leadsToCsv([lead("one")]), { columns: true });
  expect(rows.map((row: any) => [row.id, row.bid_id, row.bid_value])).toEqual([["one", "one", "0"], ["one", "two", "15000"]]);
});

test("database failure is not silently exported as missing bids", async () => {
  fail = true;
  await expect(leadsToCsv([lead("one")])).rejects.toMatchObject({ statusCode: 500 });
  fail = false;
});

test("exports more than one batch of linked bids", async () => {
  const leads = Array.from({ length: 205 }, (_, i) => lead(String(i)));
  bids = leads.map(l => ({ id: `bid-${l.id}`, lead_id: l.id, value: 15000, suppliers: [] }));
  const rows = parse(await leadsToCsv(leads), { columns: true });
  expect(rows).toHaveLength(205);
  expect(rows.every((r: any) => r.bid_value === "15000")).toBe(true);
});
