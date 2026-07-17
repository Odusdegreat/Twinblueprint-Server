import type { Request, Response } from "express";
import * as leadService from "../services/lead.service.ts";

const getId = (req: Request): string => req.params.id as string;

export const createLead = async (req: Request, res: Response) => {
  const lead = await leadService.createLead(req.body);

  res.status(201).json({
    success: true,
    message: "Lead created successfully",
    data: { lead },
  });
};

export const getLeads = async (_req: Request, res: Response) => {
  const leads = await leadService.getLeads();

  res.status(200).json({
    success: true,
    data: { leads },
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
