import type { Request, Response } from "express";
import * as notificationService from "../services/notification.service.ts";

const getId = (req: Request): string => req.params.id as string;

export const createNotification = async (req: Request, res: Response) => {
  const notification = await notificationService.createNotification(req.body);

  res.status(201).json({
    success: true,
    message: "Notification created successfully",
    data: { notification },
  });
};

export const getNotifications = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { notifications, total } = await notificationService.getNotifications(
    req.userId!,
    page,
    limit,
  );

  res.status(200).json({
    success: true,
    data: { notifications, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
};

export const markAsRead = async (req: Request, res: Response) => {
  const notification = await notificationService.markAsRead(
    getId(req),
    req.userId!,
  );

  res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: { notification },
  });
};

export const deleteNotification = async (req: Request, res: Response) => {
  await notificationService.deleteNotification(getId(req), req.userId!);

  res.status(200).json({
    success: true,
    message: "Notification deleted successfully",
  });
};
