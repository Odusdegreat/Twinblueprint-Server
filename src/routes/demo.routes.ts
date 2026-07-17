import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createDemoRequest } from "../controllers/demo.controller.ts";
import { validate } from "../middleware/validate.ts";
import { createDemoRequestSchema } from "../validations/demo.validation.ts";

const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.post("/", demoLimiter, validate(createDemoRequestSchema), createDemoRequest);

export default router;
