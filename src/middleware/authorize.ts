import type { Request, Response, NextFunction } from "express";

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
    next();
  };
};
