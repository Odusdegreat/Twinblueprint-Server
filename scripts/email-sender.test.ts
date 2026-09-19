import { expect, test } from "bun:test";
import { normalizeEmailSender } from "../src/config/email-sender.ts";

test("plain and named sender formats are accepted", () => {
  expect(normalizeEmailSender("outreach@twinblueprint.com")).toBe("outreach@twinblueprint.com");
  expect(normalizeEmailSender("TwinBlueprint <outreach@twinblueprint.com>")).toBe("TwinBlueprint <outreach@twinblueprint.com>");
});
test("surrounding whitespace is normalized without changing the mailbox", () => {
  expect(normalizeEmailSender("  outreach@twinblueprint.com  ")).toBe("outreach@twinblueprint.com");
  expect(normalizeEmailSender(" TwinBlueprint  < outreach@twinblueprint.com > ")).toBe("TwinBlueprint <outreach@twinblueprint.com>");
});
test("malformed senders fail with an actionable configuration error", () => {
  for (const sender of ["", "TwinBlueprint", "Name <email>", "email @example.com", "a@example.com,b@example.com", '"Name <a@example.com>"']) {
    expect(() => normalizeEmailSender(sender)).toThrow("Invalid FROM_EMAIL format");
  }
});
test("line breaks cannot inject sender headers", () => {
  expect(() => normalizeEmailSender("outreach@twinblueprint.com\r\nBcc: other@example.com")).toThrow("Invalid FROM_EMAIL format");
});
