import { Router } from "express";
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

router.post("/", authorize("admin"), validate(createBidSchema), createBid);
router.get("/", getBids);
router.get("/:id", getBidById);
router.patch("/:id", authorize("admin"), validate(updateBidSchema), updateBid);
router.delete("/:id", authorize("admin"), deleteBid);

export default router;
