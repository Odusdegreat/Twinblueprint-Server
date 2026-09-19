import { Router } from "express";
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
} from "../controllers/project.controller.ts";
import * as projectService from "../services/project.service.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import { createProjectSchema, projectSupplierParams, updateProjectSchema } from "../validations/project.validation.ts";

const router = Router();

router.use(authenticate);

router.post("/", authorize("admin"), validate(createProjectSchema), createProject);
router.get("/", getProjects);
router.put("/:id/suppliers/:supplierId", authorize("admin"), validate({ body: undefined, params: projectSupplierParams }), async (req, res) => {
  await projectService.linkProjectSupplier(req.params.id as string, req.params.supplierId as string);
  res.json({ success: true, message: "Supplier linked to project", data: {} });
});
router.delete("/:id/suppliers/:supplierId", authorize("admin"), validate({ body: undefined, params: projectSupplierParams }), async (req, res) => {
  await projectService.linkProjectSupplier(req.params.id as string, req.params.supplierId as string, true);
  res.json({ success: true, message: "Supplier unlinked from project", data: {} });
});
router.get("/:id", getProjectById);
router.patch("/:id", authorize("admin"), validate(updateProjectSchema), updateProject);
router.delete("/:id", authorize("admin"), deleteProject);

export default router;
