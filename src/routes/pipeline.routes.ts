import { Router } from "express";
import { getPipelineData } from "../controllers/pipeline.controller.ts";
import { authenticate } from "../middleware/auth.ts";

const router = Router();

router.use(authenticate);

router.get("/", getPipelineData);

export default router;
