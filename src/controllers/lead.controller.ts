import type { Request, Response } from "express";
import * as leadService from "../services/lead.service.ts";
import { emailService } from "../services/email.service.ts";
import { env } from "../config/env.config.ts";

const getId = (req: Request): string => req.params.id as string;

export const createLead = async (req: Request, res: Response) => {
  const lead = await leadService.createLead(req.body);

  emailService
    .sendLeadNotification({
      to: env.NOTIFICATION_EMAIL,
      fullName: lead.full_name,
      email: lead.email,
      company: lead.company ?? undefined,
      jobTitle: lead.job_title ?? undefined,
      phone: lead.phone ?? undefined,
      category: lead.category ?? undefined,
      dateSubmitted: new Date(lead.created_at),
    })
    .catch((err) => console.error("[LEAD] Email notification failed:", err));

  res.status(201).json({
    success: true,
    message: "Lead created successfully",
    data: { lead },
  });
};

export const getLeads = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { leads, total } = await leadService.getLeads(page, limit);

  res.status(200).json({
    success: true,
    data: { leads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
};

export const getLeadById = async (req: Request, res: Response) => {
  const lead = await leadService.getLeadById(getId(req));

  res.status(200).json({
    success: true,
    data: { lead },
  });
};

export const updateLead = async (req: Request, res: Response) => {
  const lead = await leadService.updateLead(getId(req), req.body);

  res.status(200).json({
    success: true,
    message: "Lead updated successfully",
    data: { lead },
  });
};

export const deleteLead = async (req: Request, res: Response) => {
  await leadService.deleteLead(getId(req));

  res.status(200).json({
    success: true,
    message: "Lead deleted successfully",
  });
};

export const assignLead = async (req: Request, res: Response) => {
  const lead = await leadService.assignLead(getId(req), req.body.assigned_to);

  res.status(200).json({
    success: true,
    message: "Lead assigned successfully",
    data: { lead },
  });
};
