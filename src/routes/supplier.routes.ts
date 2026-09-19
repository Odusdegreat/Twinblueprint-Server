import { Router } from "express";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import { supplierSchema, supplierUpdateSchema, supplierIdParams } from "../validations/supplier.validation.ts";
import { getSupplier, listSuppliers, saveSupplier } from "../services/supplier.service.ts";
import { listSupplierOpportunities } from "../services/opportunity.service.ts";
import { supplierOpportunityParams } from "../validations/opportunity.validation.ts";
const router = Router();
router.use(authenticate);
router.get("/", async (req, res) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
  res.json({ success: true, data: await listSuppliers(page, limit) });
});
router.get("/:supplierId/opportunities", validate({ body: undefined, params: supplierOpportunityParams }), async (req, res) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
  res.json({ success: true, data: await listSupplierOpportunities(req.params.supplierId as string, page, limit) });
});
router.get("/:id", validate({ body: undefined, params: supplierIdParams }), async (req, res) => {
  res.json({ success: true, data: { supplier: await getSupplier(req.params.id as string) } });
});
router.post("/", authorize("admin"), validate(supplierSchema), async (req, res) => {
  res.status(201).json({ success: true, data: { supplier: await saveSupplier(req.body) } });
});
router.patch("/:id", authorize("admin"), validate({ body: supplierUpdateSchema, params: supplierIdParams }), async (req, res) => {
  res.json({ success: true, data: { supplier: await saveSupplier(req.body, req.params.id as string) } });
});
export default router;
