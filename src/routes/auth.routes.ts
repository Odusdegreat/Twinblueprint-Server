import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, getMe, logout } from "../controllers/auth.controller.ts";
import { authenticate } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { loginSchema } from "../validations/auth.validation.ts";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.post("/login", authLimiter, validate(loginSchema), login);
router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);

export default router;
