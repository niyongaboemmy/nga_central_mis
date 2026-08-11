import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import config from "../config";

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const provided = req.header("X-API-Key") || "";
  if (!provided || !timingSafeEqual(provided, config.apiKey)) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}
