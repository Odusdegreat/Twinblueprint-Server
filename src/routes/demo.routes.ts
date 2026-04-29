import { Router } from "express";
import { createDemoRequest } from "../controllers/demo.controller.ts";

const router = Router();

router.post("/", createDemoRequest);

export default router;