import { z } from "zod/v4";

export const normalizeEmailSender = (value: string): string => {
  const invalid = () => new Error("Invalid FROM_EMAIL format. Use email@example.com or Name <email@example.com>.");
  if (/[\r\n]/.test(value)) throw invalid();
  const sender = value.trim();
  const named = /^([^<>]+?)\s*<([^<>]+)>$/.exec(sender);
  const address = (named?.[2] ?? sender).trim();
  if (!z.email().safeParse(address).success) throw invalid();
  return named ? `${named[1]!.trim()} <${address}>` : address;
};
