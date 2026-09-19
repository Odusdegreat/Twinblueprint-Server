import { Router } from "express";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import {
  createOpportunitySchema,
  opportunityIdParams,
  opportunitySupplierParams,
  updateOpportunitySchema,
} from "../validations/opportunity.validation.ts";
import * as opportunityService from "../services/opportunity.service.ts";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  res.json({ success: true, data: await opportunityService.listOpportunities(search, page, limit) });
});
router.post("/", authorize("admin"), validate(createOpportunitySchema), async (req, res) => {
  res.status(201).json({ success: true, data: { opportunity: await opportunityService.createOpportunity(req.body) } });
});
router.get("/:id", validate({ body: undefined, params: opportunityIdParams }), async (req, res) => {
  res.json({ success: true, data: { opportunity: await opportunityService.getOpportunity(req.params.id as string) } });
});
router.patch("/:id", authorize("admin"), validate({ body: updateOpportunitySchema, params: opportunityIdParams }), async (req, res) => {
  res.json({ success: true, data: { opportunity: await opportunityService.updateOpportunity(req.params.id as string, req.body) } });
});
router.delete("/:id", authorize("admin"), validate({ body: undefined, params: opportunityIdParams }), async (req, res) => {
  await opportunityService.deleteOpportunity(req.params.id as string);
  res.json({ success: true, data: {} });
});
router.put("/:id/suppliers/:supplierId", authorize("admin"), validate({ body: undefined, params: opportunitySupplierParams }), async (req, res) => {
  await opportunityService.linkOpportunitySupplier(req.params.id as string, req.params.supplierId as string);
  res.json({ success: true, message: "Supplier linked to opportunity", data: {} });
});
router.delete("/:id/suppliers/:supplierId", authorize("admin"), validate({ body: undefined, params: opportunitySupplierParams }), async (req, res) => {
  await opportunityService.linkOpportunitySupplier(req.params.id as string, req.params.supplierId as string, true);
  res.json({ success: true, message: "Supplier unlinked from opportunity", data: {} });
});

export default router;