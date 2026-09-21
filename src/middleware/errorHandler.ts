import type { NextFunction, Request, Response } from "express";
import { z } from "zod/v4";

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

const ERROR_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Resource not found",
  409: "Conflict",
  429: "Too many requests",
  500: "Internal server error",
  502: "Service unavailable",
  503: "Service unavailable",
};

const VALIDATION_MESSAGE = "Please check the highlighted fields.";
const VALIDATION_FIELD_FALLBACK = "This field is invalid.";

// Human-readable copy per validation field path. Add entries as new fields
// need custom copy; unmapped paths fall back to VALIDATION_FIELD_FALLBACK.
const VALIDATION_FIELD_MESSAGES: Readonly<Record<string, string>> = {
  username: "Username is required",
  password: "Password is required",
  passcode: "Passcode is required",
  full_name: "Name is required",
  email: "A valid email is required",
  workEmail: "A valid email is required",
  company: "Company is required",
  job_title: "Job title is required",
  phone: "Phone is required",
  industry: "A valid industry is required",
  region: "Region is required",
  region_group: "Region group is required",
  state: "State is required",
  country: "Country is required",
  project: "Project name is required",
  project_size: "Project size is required",
  project_value: "Project value must be a non-negative number",
  currency: "Currency is required",
  phase: "A valid phase is required",
  lead_status: "A valid lead status is required",
  status: "A valid status is required",
  applications: "Applications must be a non-negative number",
  application_tools: "Application tools are required",
  score: "Score must be between 0 and 100",
  temperature: "A valid temperature is required",
  assigned_to: "A valid assignee is required",
  archived: "A valid archived value is required",
  client: "Client is required",
  deadline: "A valid deadline is required",
  suppliers: "Suppliers must be a list",
  lead_id: "A valid lead is required",
  bid_id: "A valid bid is required",
  project_id: "A valid project is required",
  supplier_id: "A valid supplier is required",
  name: "Name is required",
  role: "Role is required",
  tools: "Tools must be a list",
  contact: "Contact details are required",
  visualisation_tool: "Visualisation tool is required",
  uses_3d: "A valid 3D usage value is required",
  opportunity: "Opportunity is required",
  pain_points: "Pain points must be a list",
  description: "Description is required",
  insight: "Insight is required",
  type: "A valid type is required",
  sent: "Sent count must be a non-negative number",
  opened: "Opened count must be a non-negative number",
  clicked: "Clicked count must be a non-negative number",
  campaign_date: "Campaign date is required",
  start_date: "Start date is required",
  end_date: "End date is required",
  progress: "Progress must be between 0 and 100",
  value: "A valid value is required",
  id: "A valid ID is required",
  page: "Page must be a positive number",
  limit: "Limit must be between 1 and 100",
  meetingId: "A valid meeting ID is required",
  sequenceId: "A valid sequence ID is required",
  stepId: "A valid step ID is required",
  start: "Start timestamp is required",
  end: "End timestamp is required",
  channel: "A valid channel is required",
  message: "Message is required",
  subject: "Subject is required",
  reason: "A valid reason is required",
  notes: "Notes are required",
  scheduled_at: "A valid scheduled time is required",
  replied_at: "A valid replied time is required",
  sent_at: "A valid non-future sent time is required",
  completed_at: "A valid completion time is required",
  due_at: "A valid due time is required",
  outcome: "Outcome is required",
  start_at: "A valid start time is required",
  steps: "Steps are required",
  template: "Template is required",
};

const validationFields = (issues: Array<{ path: PropertyKey[] }>) => {
  const fields = new Map<string, string>();
  for (const issue of issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "request";
    if (!fields.has(path)) fields.set(path, VALIDATION_FIELD_MESSAGES[path] ?? VALIDATION_FIELD_FALLBACK);
  }
  return [...fields]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, fieldMessage]) => ({ path, message: fieldMessage }));
};

// API errors hand-authored by services (4xx) are safe to show; anything at or
// above 500 is an internal failure whose details must never reach a client.
const statusCode = (err: AppError): number =>
  typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode <= 599
    ? Math.floor(err.statusCode)
    : 500;

const clientMessage = (err: AppError, status: number): string => {
  if (status < 500 && err.message) return err.message;
  return ERROR_MESSAGES[status] ?? "Internal server error";
};

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: VALIDATION_MESSAGE,
      fields: validationFields(err.issues),
    });
    return;
  }

  const status = statusCode(err);
  console.error(`[ERROR] ${status} - ${err.message}`);
  if (err.stack) console.error(err.stack);

  res.status(status).json({ success: false, message: clientMessage(err, status) });
};
