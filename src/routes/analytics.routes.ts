import { Router } from "express";
import { getWeekly, getFunnel, getKPIs, getDashboard } from "../controllers/analytics.controller.ts";
import { authenticate } from "../middleware/auth.ts";

const router = Router();

router.use(authenticate);

router.get("/weekly", getWeekly);
router.get("/funnel", getFunnel);
router.get("/kpis", getKPIs);
router.get("/dashboard", getDashboard);

export default router;
