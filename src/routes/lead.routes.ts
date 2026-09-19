import { Router } from "express";
import multer from "multer";
import {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  assignLead,
  importLeads,
  exportLeads,
  getLeadOptions,
  moveLeadToPipeline,
} from "../controllers/lead.controller.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorize, authorizeLeadUpdate } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import {
  createLeadSchema,
  updateLeadSchema,
  assignLeadSchema,
} from "../validations/lead.validation.ts";
import { moveLeadToPipelineSchema } from "../validations/bid.validation.ts";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.use(authenticate);

router.post("/", validate(createLeadSchema), createLead);
router.get("/", getLeads);
router.get("/options", getLeadOptions);
router.post("/import", authorize("admin"), upload.single("file"), importLeads);
router.get("/export", authorize("admin"), exportLeads);
router.post("/:id/move-to-pipeline", authorize("admin"), validate(moveLeadToPipelineSchema), moveLeadToPipeline);
router.get("/:id", getLeadById);
router.patch("/:id", validate(updateLeadSchema), authorizeLeadUpdate, updateLead);
router.delete("/:id", authorize("admin"), deleteLead);
router.patch("/:id/assign", validate(assignLeadSchema), assignLead);

export default router;
