import { Router } from "express";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import * as schemas from "../validations/outreach-activity.validation.ts";
import * as service from "../services/outreach-activity.service.ts";

const router = Router(); // Inherits Outreach authentication.
router.get("/stats", async (req, res, next) => {
  const result = schemas.outreachPeriodSchema.safeParse(req.query);
  if (!result.success) { next(result.error); return; }
  res.json({ success: true, data: await service.getOutreachStats(result.data) });
});
for (const kind of ["replies", "meetings"] as const) {
  router.get(`/${kind}`, async (req, res, next) => {
    const result = schemas.outreachActivityListSchema.safeParse(req.query);
    if (!result.success) { next(result.error); return; }
    const { lead_id, page, limit } = result.data;
    res.json({ success: true, data: await service.listOutreachActivity(kind, lead_id, page, limit) });
  });
}
router.post("/replies", authorize("admin"), validate(schemas.recordReplySchema), async (req, res) => {
  res.status(201).json({ success: true, data: await service.recordOutreachActivity("reply", req.body) });
});
router.post("/meetings", authorize("admin"), validate(schemas.recordMeetingSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await service.recordOutreachActivity("meeting", req.body) });
});
router.patch("/meetings/:meetingId", authorize("admin"), validate({ body: schemas.updateMeetingSchema, params: schemas.meetingParamsSchema }), async (req, res) => {
  res.json({ success: true, data: await service.updateOutreachMeeting(String(req.params.meetingId), req.body) });
});
export default router;
