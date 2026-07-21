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
      email: newLead.email,
      company: newLead.company ?? undefined,
      jobTitle: newLead.job_title ?? undefined,
      phone: newLead.phone ?? undefined,
      category: newLead.category ?? undefined,
      dateSubmitted: new Date(newLead.created_at),
    })
    .catch((err) => console.error("[DEMO] Email notification failed:", err));

  res.status(201).json({
    success: true,
    message: "Demo request submitted successfully",
    data: newLead,
  });
};
