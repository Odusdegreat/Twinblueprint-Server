import { Router } from "express";
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
} from "../controllers/project.controller.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import { createProjectSchema, updateProjectSchema } from "../validations/project.validation.ts";

const router = Router();

router.use(authenticate);

router.post("/", authorize("admin"), validate(createProjectSchema), createProject);
router.get("/", getProjects);
router.get("/:id", getProjectById);
router.patch("/:id", authorize("admin"), validate(updateProjectSchema), updateProject);
router.delete("/:id", authorize("admin"), deleteProject);

export default router;
