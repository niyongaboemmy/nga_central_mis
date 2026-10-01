import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

/** Fields never written to the log (plan G4): credentials, one-time codes, secrets. */
const SECRET_KEYS = /^(password|newPassword|currentPassword|oldPassword|confirmPassword|password_hash|otp|code|token|tempToken|refresh_token|access_token|id_token|credential|client_secret|secret|api_key|apiKey)$/i;

export const redactBody = (body: unknown, depth = 0): unknown => {
  if (!body || typeof body !== "object" || depth > 4) return body;
  if (Array.isArray(body)) return body.slice(0, 20).map((v) => redactBody(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redactBody(v, depth + 1);
  }
  return out;
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();
  // Heartbeats and analytics batches arrive every few seconds from every tab.
  if (req.originalUrl.startsWith("/activity/")) return next();

  // Log request
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    body: req.method !== "GET" ? redactBody(req.body) : undefined,
  });

  // Log response
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
      {
        statusCode: res.statusCode,
        duration,
      }
    );
  });

  next();
};
