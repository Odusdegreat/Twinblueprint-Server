import { Router } from "express";
import { resendWebhook } from "../controllers/outreach.controller.ts";
const router = Router();
router.post("/resend", resendWebhook);
export default router;
