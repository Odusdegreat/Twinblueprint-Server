import type { Request, Response } from "express";
import * as campaignService from "../services/campaign.service.ts";

const getId = (req: Request): string => req.params.id as string;

export const createCampaign = async (req: Request, res: Response) => {
  const campaign = await campaignService.createCampaign(req.body);

  res.status(201).json({
    success: true,
    message: "Campaign created successfully",
    data: { campaign },
  });
};

export const getCampaigns = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { campaigns, total } = await campaignService.getCampaigns(page, limit);

  res.status(200).json({
    success: true,
    data: { campaigns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
};

export const getCampaignById = async (req: Request, res: Response) => {
  const campaign = await campaignService.getCampaignById(getId(req));

  res.status(200).json({
    success: true,
    data: { campaign },
  });
};

export const updateCampaign = async (req: Request, res: Response) => {
  const campaign = await campaignService.updateCampaign(getId(req), req.body);

  res.status(200).json({
    success: true,
    message: "Campaign updated successfully",
    data: { campaign },
  });
};

export const deleteCampaign = async (req: Request, res: Response) => {
  await campaignService.deleteCampaign(getId(req));

  res.status(200).json({
    success: true,
    message: "Campaign deleted successfully",
  });
};

export const getCampaignStats = async (_req: Request, res: Response) => {
  const stats = await campaignService.getCampaignStats();

  res.status(200).json({
    success: true,
    data: stats,
  });
};
