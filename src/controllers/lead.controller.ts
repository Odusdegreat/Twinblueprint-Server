import type { Request, Response } from "express";
import * as leadService from "../services/lead.service.ts";
import { emailService } from "../services/email.service.ts";
import { env } from "../config/env.config.ts";
import { INDUSTRIES } from "../config/industries.ts";
import { REGIONS } from "../config/regions.ts";
import type { LeadFilters } from "../services/lead.service.ts";

const getId = (req: Request): string => req.params.id as string;

export const getLeadOptions = async (_req: Request, res: Response) => {
  const countries = await leadService.getCountryOptions();
  res.status(200).json({
    success: true,
    data: {
      industries: INDUSTRIES,
      regions: REGIONS,
      countries,
      project_sizes: ["Under $5M", "$5M-$20M", "$20M-$50M", "$50M-$100M", "$100M-$250M", "$250M-$500M", "$500M-$1B", "$1B+"],
      phases: ["Discovery", "Bid", "In-flight"],
      statuses: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"],
      lead_statuses: ["New", "Identified", "Bidding", "Inflight", "Closed"],
      temperatures: ["hot", "warm", "cool"],
    },
  });
};

export const createLead = async (req: Request, res: Response) => {
  const lead = await leadService.createLead(req.body);

  emailService
    .sendLeadNotification({
      to: env.NOTIFICATION_EMAIL,
      fullName: lead.full_name,
    })
    .catch((err) => console.error("[LEAD] Email notification failed:", err));

  if (req.body.send_confirmation_email === true) {
    emailService
      .sendSubmitterConfirmation({
        to: lead.email,
        fullName: lead.full_name,
        source: "lead",
      })
      .catch((err) => console.error("[LEAD] Lead confirmation email failed:", err));
  }

  res.status(201).json({
    success: true,
    message: "Lead created successfully",
    data: { lead },
  });
};

export const getLeads = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filters: LeadFilters = {
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    industry: typeof req.query.industry === "string" ? req.query.industry : undefined,
    region: typeof req.query.region === "string" ? req.query.region : undefined,
    project: typeof req.query.project === "string" ? req.query.project : undefined,
    project_size: typeof req.query.project_size === "string" ? req.query.project_size : undefined,
    phase: typeof req.query.phase === "string" ? req.query.phase : undefined,
    lead_status: typeof req.query.lead_status === "string" ? req.query.lead_status : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    temperature: typeof req.query.temperature === "string" ? req.query.temperature : undefined,
    min_score: req.query.min_score === undefined ? undefined : Number(req.query.min_score),
    archived: req.query.archived === undefined ? undefined : req.query.archived === "true",
    sort_by: ["created_at", "updated_at", "score", "full_name", "company", "industry", "project", "region", "project_size", "phase", "status", "lead_status"].includes(String(req.query.sort_by)) ? String(req.query.sort_by) as LeadFilters["sort_by"] : undefined,
    sort_order: req.query.sort_order === "asc" ? "asc" : req.query.sort_order === "desc" ? "desc" : undefined,
  };
  const { leads, total } = await leadService.getLeads(page, limit, filters);

  res.status(200).json({
    success: true,
    data: { leads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
};

export const importLeads = async (req: Request, res: Response) => {
  if (!req.file) throw Object.assign(new Error("CSV file is required"), { statusCode: 400 });
  const result = await leadService.importLeads(req.file.buffer);
  if (result.created === 0 && result.updated === 0) {
    res.status(result.failed === 0 && result.skipped > 0 ? 409 : 400).json({
      success: false,
      partial_success: false,
      errors: result.errors,
      message: result.errors[0]?.message ?? "No leads were imported",
      data: result,
    });
    return;
  }
  const partialSuccess = result.failed > 0 || result.bids_failed > 0 || result.skipped > 0;
  res.status(200).json({
    success: !partialSuccess,
    partial_success: partialSuccess,
    errors: result.errors,
    message: `${partialSuccess ? "Import partially completed. " : ""}Created ${result.created} lead(s). Updated ${result.updated} lead(s). ${result.skipped} duplicate CSV row(s) skipped. ${result.failed} row(s) failed. Bids: ${result.bids_created} created, ${result.bids_updated} updated, ${result.bids_failed} failed.${partialSuccess && result.errors[0] ? ` Row ${result.errors[0].row}: ${result.errors[0].message}` : ""}`,
    data: result,
  });
};

export const exportLeads = async (req: Request, res: Response) => {
  const filters: LeadFilters = {
    region: typeof req.query.region === "string" ? req.query.region : undefined,
    phase: typeof req.query.phase === "string" ? req.query.phase : undefined,
    project_size: typeof req.query.project_size === "string" ? req.query.project_size : undefined,
    temperature: typeof req.query.temperature === "string" ? req.query.temperature : undefined,
    archived: req.query.archived === undefined ? undefined : req.query.archived === "true",
  };
  const { leads } = await leadService.getLeads(1, 100_000, filters);
  const csv = await leadService.leadsToCsv(leads);
  res.type("text/csv").attachment("leads.csv").send(csv);
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

export const moveLeadToPipeline = async (req: Request, res: Response) => {
  const result = await leadService.moveLeadToPipeline(getId(req), req.body);

  res.status(201).json({
    success: true,
    message: "Lead moved to pipeline successfully",
    data: result,
  });
};

export const deleteLead = async (req: Request, res: Response) => {
  await leadService.deleteLead(getId(req));

  res.status(200).json({
    success: true,
    message: "Lead deleted successfully",
    data: {},
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
