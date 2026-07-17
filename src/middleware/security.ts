import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export const requestId = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  req.headers["x-request-id"] =
    (req.headers["x-request-id"] as string) || crypto.randomUUID();
  next();
};

export const removePoweredBy = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.removeHeader("X-Powered-By");
  next();
};

export const sanitizeInput = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (req.body && typeof req.body === "object") {
    sanitizeObject(req.body);
  }
  next();
};

const sanitizeObject = (obj: Record<string, unknown>): void => {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "string") {
      obj[key] = (obj[key] as string)
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeObject(obj[key] as Record<string, unknown>);
    }
  }
};
