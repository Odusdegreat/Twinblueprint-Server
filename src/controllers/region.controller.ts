import type { Request, Response } from "express";
import { getRegionalDashboard } from "../services/region.service.ts";
import { REGIONS } from "../config/regions.ts";
export const getRegionOptions = async (_req: Request, res: Response) => res.json({ success: true, data: { regions: REGIONS } });
export const getEmea = async (_req: Request, res: Response) => res.json({ success: true, data: await getRegionalDashboard("emea") });
export const getAmericas = async (_req: Request, res: Response) => res.json({ success: true, data: await getRegionalDashboard("americas") });
