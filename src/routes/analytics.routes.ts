import { Router } from "express";
import { getWeekly, getFunnel, getKPIs } from "../controllers/analytics.controller.ts";
import { authenticate } from "../middleware/auth.ts";

const router = Router();

router.use(authenticate);

router.get("/weekly", getWeekly);
router.get("/funnel", getFunnel);
router.get("/kpis", getKPIs);

export default router;
