import { Router } from "express";
import { linkSupplier } from "../services/supplier.service.ts";
import { supplierLinkParams } from "../validations/supplier.validation.ts";
import {
  createBid,
  getBids,
  getBidById,
  updateBid,
  deleteBid,
} from "../controllers/bid.controller.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import { createBidSchema, updateBidSchema } from "../validations/bid.validation.ts";

const router = Router();

router.use(authenticate);
router.put("/:id/suppliers/:supplierId", authorize("admin"), validate({ body: undefined, params: supplierLinkParams }), async (req, res) => {
  await linkSupplier(req.params.id as string, req.params.supplierId as string);
  res.json({ success: true, message: "Supplier linked to bid", data: {} });
});
router.delete("/:id/suppliers/:supplierId", authorize("admin"), validate({ body: undefined, params: supplierLinkParams }), async (req, res) => {
  await linkSupplier(req.params.id as string, req.params.supplierId as string, true);
  res.json({ success: true, message: "Supplier unlinked from bid", data: {} });
});

router.post("/", authorize("admin"), validate(createBidSchema), createBid);
router.get("/", getBids);
router.get("/:id", getBidById);
router.patch("/:id", authorize("admin"), validate(updateBidSchema), updateBid);
router.delete("/:id", authorize("admin"), deleteBid);

export default router;
