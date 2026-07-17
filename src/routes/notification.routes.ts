import { Router } from "express";
import {
  createNotification,
  getNotifications,
  markAsRead,
  deleteNotification,
} from "../controllers/notification.controller.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import { createNotificationSchema } from "../validations/notification.validation.ts";

const router = Router();

router.use(authenticate);

router.post("/", authorize("admin"), validate(createNotificationSchema), createNotification);
router.get("/", getNotifications);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

export default router;
