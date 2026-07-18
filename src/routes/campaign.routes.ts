import { Router } from "express";
import {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  getCampaignStats,
} from "../controllers/campaign.controller.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import { createCampaignSchema, updateCampaignSchema } from "../validations/campaign.validation.ts";

const router = Router();

router.use(authenticate);

router.get("/stats", getCampaignStats);
router.post("/", authorize("admin"), validate(createCampaignSchema), createCampaign);
router.get("/", getCampaigns);
router.get("/:id", getCampaignById);
router.patch("/:id", authorize("admin"), validate(updateCampaignSchema), updateCampaign);
router.delete("/:id", authorize("admin"), deleteCampaign);

export default router;
