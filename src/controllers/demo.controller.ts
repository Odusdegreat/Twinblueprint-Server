import type { Request, Response } from "express";
import { createDemoService } from "../services/demo.service.ts";
import { emailService } from "../services/email.service.ts";
import { env } from "../config/env.config.ts";
import type { CreateDemoRequestDTO } from "../types/demo.types.ts";

export const createDemoRequest = async (req: Request, res: Response) => {
  const body: CreateDemoRequestDTO = req.body;

  const newLead = await createDemoService(body);

  emailService
    .sendLeadNotification({
      to: env.NOTIFICATION_EMAIL,
      fullName: newLead.full_name,
    })
    .catch((err) => console.error("[DEMO] Email notification failed:", err));

  // Every successful demo booking sends the submitter a confirmation.
  emailService
    .sendSubmitterConfirmation({
      to: newLead.email,
      fullName: newLead.full_name,
      source: "demo",
    })
    .then((result) => {
      if (!result.success) console.error("[DEMO] Booking confirmation email failed:", result.error ?? result.message);
    })
    .catch((err) => console.error("[DEMO] Booking confirmation email failed:", err));

  res.status(201).json({
    success: true,
    message: "Demo request submitted successfully",
    data: newLead,
  });
};
