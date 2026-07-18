import type { Request, Response } from "express";
import * as bidService from "../services/bid.service.ts";

const getId = (req: Request): string => req.params.id as string;

export const createBid = async (req: Request, res: Response) => {
  const bid = await bidService.createBid(req.body);

  res.status(201).json({
    success: true,
    message: "Bid created successfully",
    data: { bid },
  });
};

export const getBids = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { bids, total } = await bidService.getBids(page, limit);

  res.status(200).json({
    success: true,
    data: { bids, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
};

export const getBidById = async (req: Request, res: Response) => {
  const bid = await bidService.getBidById(getId(req));

  res.status(200).json({
    success: true,
    data: { bid },
  });
};

export const updateBid = async (req: Request, res: Response) => {
  const bid = await bidService.updateBid(getId(req), req.body);

  res.status(200).json({
    success: true,
    message: "Bid updated successfully",
    data: { bid },
  });
};

export const deleteBid = async (req: Request, res: Response) => {
  await bidService.deleteBid(getId(req));

  res.status(200).json({
    success: true,
    message: "Bid deleted successfully",
  });
};
