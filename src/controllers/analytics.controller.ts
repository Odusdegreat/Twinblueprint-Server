import type { Request, Response } from "express";
import * as analyticsService from "../services/analytics.service.ts";

export const getWeekly = async (req: Request, res: Response) => {
  const weeks = Math.min(52, Math.max(1, Number(req.query.weeks) || 8));
  const weekly = await analyticsService.getWeeklyData(weeks);

  res.status(200).json({
    success: true,
    data: { weekly },
  });
};

export const getFunnel = async (_req: Request, res: Response) => {
  const funnel = await analyticsService.getFunnelData();

  res.status(200).json({
    success: true,
    data: { funnel },
  });
};

export const getKPIs = async (_req: Request, res: Response) => {
  const kpis = await analyticsService.getKPIs();

  res.status(200).json({
    success: true,
    data: kpis,
  });
};
