import type { Request, Response } from "express";
import { env } from "../config/env.config.ts";
import * as outreach from "../services/outreach.service.ts";
import { Resend } from "resend";

export const preview = async (req: Request, res: Response) => res.json({ success: true, data: await outreach.preview(req.body) });
export const send = async (req: Request, res: Response) => res.status(201).json({ success: true, data: { message: await outreach.send(req.body) } });
export const messages = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const result = await outreach.getMessages(page, limit);
  res.json({ success: true, data: { ...result, pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) } } });
};
export const resendWebhook = async (req: Request, res: Response) => {
  if (!env.RESEND_WEBHOOK_SECRET) throw Object.assign(new Error("Webhook verification is not configured"), { statusCode: 503 });
  const headers = { id: String(req.headers["svix-id"] ?? ""), timestamp: String(req.headers["svix-timestamp"] ?? ""), signature: String(req.headers["svix-signature"] ?? "") };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    res.status(401).json({ success: false, message: "Invalid webhook signature" });
    return;
  }
  try {
    const event = new Resend().webhooks.verify({ payload: req.rawBody?.toString("utf8") ?? "", headers, webhookSecret: env.RESEND_WEBHOOK_SECRET });
    await outreach.processWebhook(event);
    res.status(200).json({ success: true });
  } catch {
    res.status(401).json({ success: false, message: "Invalid webhook signature" });
  }
};
