import type { Request, Response, NextFunction } from "express";

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
};

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";

  console.error(`[ERROR] ${statusCode} - ${err.message}`);

  if (!isProd && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message: isProd && statusCode === 500
      ? ERROR_MESSAGES[500]
      : err.message || ERROR_MESSAGES[statusCode] || ERROR_MESSAGES[500],
    ...(isProd ? {} : { stack: err.stack }),
  });
};
