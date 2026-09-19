import { Router } from "express";
import { authorize } from "../middleware/authorize.ts";
import { validate } from "../middleware/validate.ts";
import * as schemas from "../validations/sequence.validation.ts";
import * as service from "../services/sequence.service.ts";
import { z } from "zod/v4";

const router = Router(); // Authentication is inherited from outreach.routes.
router.get("/", async (req, res, next) => {
  const result = schemas.sequenceListSchema.safeParse(req.query);
  if (!result.success) { next(result.error); return; }
  const { lead_id, page, limit } = result.data;
  res.json({ success: true, data: await service.listSequences(lead_id, page, limit) });
});
router.get("/:sequenceId", validate({ body: z.unknown(), params: schemas.sequenceParamsSchema }), async (req, res) => {
  res.json({ success: true, data: await service.getSequence(String(req.params.sequenceId)) });
});
router.use(authorize("admin"));
router.post("/", validate(schemas.startSequenceSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await service.startSequence(req.body) });
});
for (const action of ["pause", "resume", "cancel"] as const) {
  router.post(`/:sequenceId/${action}`, validate({ body: schemas.sequenceControlSchema, params: schemas.sequenceParamsSchema }), async (req, res) => {
    res.json({ success: true, data: await service.changeSequence(String(req.params.sequenceId), action, req.body) });
  });
}
router.patch("/:sequenceId/steps/:stepId", validate({ body: schemas.editSequenceStepSchema, params: schemas.sequenceStepParamsSchema }), async (req, res) => {
  res.json({ success: true, data: await service.changeSequence(String(req.params.sequenceId), "edit", req.body, String(req.params.stepId)) });
});
for (const action of ["complete", "skip"] as const) {
  router.post(`/:sequenceId/steps/:stepId/${action}`, validate({ body: schemas.completeSequenceStepSchema, params: schemas.sequenceStepParamsSchema }), async (req, res) => {
    res.json({ success: true, data: await service.changeSequence(String(req.params.sequenceId), action, req.body, String(req.params.stepId)) });
  });
}
export default router;
