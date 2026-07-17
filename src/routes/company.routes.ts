import { Router } from "express";
import {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
} from "../controllers/company.controller.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import {
  createCompanySchema,
  updateCompanySchema,
} from "../validations/company.validation.ts";

const router = Router();

router.use(authenticate);

router.post("/", validate(createCompanySchema), createCompany);
router.get("/", getCompanies);
router.get("/:id", getCompanyById);
router.patch("/:id", validate(updateCompanySchema), updateCompany);
router.delete("/:id", authorize("admin"), deleteCompany);

export default router;
