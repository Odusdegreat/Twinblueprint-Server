import { Router } from "express";
import { authenticate } from "../middleware/auth.ts";
import { getAmericas, getEmea, getRegionOptions } from "../controllers/region.controller.ts";
const router = Router();
router.use(authenticate);
router.get("/", getRegionOptions);
router.get("/emea", getEmea);
router.get("/americas", getAmericas);
export default router;
