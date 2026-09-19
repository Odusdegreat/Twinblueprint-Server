import express from "express";
import supplierRoutes from "./routes/supplier.routes.ts";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { readRateLimitConfig } from "./config/rate-limit.config.ts";
import { createApiLimiters } from "./middleware/rateLimit.ts";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env.config.ts";
import openapiSpec from "../openapi.json" with { type: "json" };
import authRoutes from "./routes/auth.routes.ts";
import bidRoutes from "./routes/bid.routes.ts";
import campaignRoutes from "./routes/campaign.routes.ts";
import analyticsRoutes from "./routes/analytics.routes.ts";
import demoRoutes from "./routes/demo.routes.ts";
import leadRoutes from "./routes/lead.routes.ts";
import pipelineRoutes from "./routes/pipeline.routes.ts";
import projectRoutes from "./routes/project.routes.ts";
import regionRoutes from "./routes/region.routes.ts";
import outreachRoutes from "./routes/outreach.routes.ts";
import webhookRoutes from "./routes/webhook.routes.ts";
import opportunityRoutes from "./routes/opportunity.routes.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { INDUSTRIES } from "./config/industries.ts";
import {
  requestId,
  removePoweredBy,
  sanitizeInput,
} from "./middleware/security.ts";

const app = express();
const rateLimitConfig = readRateLimitConfig();
app.set("trust proxy", rateLimitConfig.trustProxyHops);

// Raw OpenAPI JSON spec
app.get("/api-docs.json", (_req, res) => {
  res.json(openapiSpec);
});

// API docs — mounted before helmet so Swagger UI assets are not blocked by CSP
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Request ID + remove X-Powered-By
app.use(requestId);
app.use(removePoweredBy);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        imgSrc: ["'none'"],
        connectSrc: ["'none'"],
        fontSrc: ["'none'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    xssFilter: true,
  }),
);

// Request logging
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// CORS
app.use(
  cors({
    origin: env.CLIENT_URLS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID", "Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "RateLimit-Policy"],
    maxAge: 86400,
  }),
);

// Broad API protection; sensitive routes retain their stricter local limiters.
app.use("/api", ...createApiLimiters(rateLimitConfig));

// Body parsing with size limits
app.use(express.json({ limit: "10kb", verify: (req, _res, buffer) => { (req as express.Request).rawBody = buffer; } }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// Input sanitization
app.use(sanitizeInput);

// Health check (no auth required)
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "OK",
    data: { uptime: process.uptime(), timestamp: new Date().toISOString() },
  });
});

// Industries list (no auth required)
app.get("/api/industries", (_req, res) => {
  res.status(200).json({
    success: true,
    data: { industries: [...INDUSTRIES] },
  });
});

// Routes
app.use("/api/analytics", analyticsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/opportunities", opportunityRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/pipeline", pipelineRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/regions", regionRoutes);
app.use("/api/outreach", outreachRoutes);
app.use("/api/webhooks", webhookRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global error handler
app.use(errorHandler);

export default app;
