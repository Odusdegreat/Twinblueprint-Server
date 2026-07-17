import { Router } from "express";
import {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  assignLead,
} from "../controllers/lead.controller.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import {
  createLeadSchema,
  updateLeadSchema,
  assignLeadSchema,
} from "../validations/lead.validation.ts";

const router = Router();

router.use(authenticate);

router.post("/", validate(createLeadSchema), createLead);
router.get("/", getLeads);
router.get("/:id", getLeadById);
router.patch("/:id", validate(updateLeadSchema), updateLead);
router.delete("/:id", authorize("admin"), deleteLead);
router.patch("/:id/assign", validate(assignLeadSchema), assignLead);

export default router;
