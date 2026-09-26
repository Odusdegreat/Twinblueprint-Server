import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.config.ts";

interface JwtPayload {
  sub: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      rawBody?: Buffer;
    }
  }
}

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

// The auth cookie is SameSite=None so the front-end hosts can send it, which also means
// any site can make the browser attach it. CORS only gates response reading, so unsafe
// methods authenticated by the cookie must additionally come from an approved origin.
// Bearer-token callers are unaffected: they are not ambient browser credentials.
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const cookieToken = req.cookies?.token;
  const token =
    cookieToken ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  if (cookieToken && !safeMethods.has(req.method) && !env.CLIENT_URLS.includes(req.headers.origin ?? "")) {
    res.status(403).json({ success: false, message: "Untrusted origin for cookie authentication; send an Authorization: Bearer token instead" });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.userId = decoded.sub;
    req.userRole = decoded.role;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
