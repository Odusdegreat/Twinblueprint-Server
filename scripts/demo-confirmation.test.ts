import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
const lead = { id: "demo-lead", full_name: "Demo Requester", email: "requester@example.test", company: "Example", job_title: "Engineer", phone: "+123456789", industry: "Engineering", created_at: "2026-09-14T09:00:00Z" };
const create = mock(async () => lead);
const team = mock(async () => ({ success: true, message: "Sent" }));
const submitter = mock(async () => ({ success: true, message: "Sent" }));
mock.module("../src/services/demo.service.ts", () => ({ createDemoService: create }));
mock.module("../src/services/email.service.ts", () => ({ emailService: { sendLeadNotification: team, sendSubmitterConfirmation: submitter } }));
mock.module("../src/config/env.config.ts", () => ({ env: { NOTIFICATION_EMAIL: "team@example.test" } }));
const { createDemoRequest } = await import("../src/controllers/demo.controller.ts");
const log = spyOn(console, "error").mockImplementation(() => {});
afterAll(() => log.mockRestore());
beforeEach(() => { create.mockClear(); team.mockClear(); submitter.mockClear(); log.mockClear(); });
const response = () => {
  const res: any = { status: mock(() => res), json: mock(() => res) };
  return res;
};
for (const confirmationEmail of [undefined, false, true]) {
  test(`successful booking sends both emails when confirmationEmail is ${confirmationEmail}`, async () => {
    const res = response();
    await createDemoRequest({ body: { fullName: lead.full_name, workEmail: lead.email, ...(confirmationEmail === undefined ? {} : { confirmationEmail }) } } as any, res);
    expect(team).toHaveBeenCalledTimes(1);
    expect(submitter).toHaveBeenCalledTimes(1);
    expect(submitter).toHaveBeenCalledWith({ to: lead.email, fullName: lead.full_name, source: "demo" });
    expect(res.status).toHaveBeenCalledWith(201);
  });
}
test("failed bookings do not send any confirmation", async () => {
  create.mockRejectedValueOnce(new Error("Insert failed"));
  await expect(createDemoRequest({ body: {} } as any, response())).rejects.toThrow("Insert failed");
  expect(team).not.toHaveBeenCalled(); expect(submitter).not.toHaveBeenCalled();
});
test("provider-reported confirmation failure is logged without losing the saved booking", async () => {
  submitter.mockResolvedValueOnce({ success: false, message: "Provider unavailable" });
  const res = response();
  await createDemoRequest({ body: {} } as any, res);
  await Promise.resolve();
  expect(log).toHaveBeenCalledWith("[DEMO] Booking confirmation email failed:", "Provider unavailable");
  expect(res.status).toHaveBeenCalledWith(201);
});
