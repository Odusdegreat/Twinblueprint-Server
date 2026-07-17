import type { Request, Response } from "express";
import * as authService from "../services/auth.service.ts";
import { cookieConfig } from "../config/cookies.ts";

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  const { user, token } = await authService.login(username, password);

  res.cookie("token", token, cookieConfig);

  res.status(200).json({
    success: true,
    message: "Logged in successfully",
    data: { user, token },
  });
};

export const getMe = async (req: Request, res: Response) => {
  const user = await authService.getCurrentUser(req.userId!);

  res.status(200).json({
    success: true,
    data: { user },
  });
};

export const logout = async (_req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};
