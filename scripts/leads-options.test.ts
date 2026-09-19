import { expect, mock, test } from "bun:test";
mock.module("../src/config/supabase.ts", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        not: () => ({
          range: async () => ({ data: [{ country: "United Kingdom" }, { country: "Germany" }, { country: "Germany" }, { country: null }], error: null }),
        }),
      }),
    }),
  },
}));
mock.module("../src/config/env.config.ts", () => ({ env: {} }));
mock.module("../src/services/email.service.ts", () => ({ emailService: {} }));
const { getLeadOptions } = await import("../src/controllers/lead.controller.ts");

test("/leads/options lists distinct recorded countries alongside regions", async () => {
  let body: any;
  const res = { status() { return this; }, json(value: unknown) { body = value; } };
  await getLeadOptions({} as any, res as any);
  expect(body.success).toBe(true);
  expect(body.data.countries).toEqual(["Germany", "United Kingdom"]);
  expect(body.data.regions).toBeDefined();
});