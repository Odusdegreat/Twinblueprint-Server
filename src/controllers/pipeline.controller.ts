import type { Request, Response } from "express";
import { getPipeline } from "../services/pipeline.service.ts";

export const getPipelineData = async (_req: Request, res: Response) => {
  const pipeline = await getPipeline();

  res.status(200).json({
    success: true,
    data: pipeline,
  });
};
