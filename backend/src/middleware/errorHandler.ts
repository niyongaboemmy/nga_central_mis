import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.error(err.stack);

  // Handle custom errors with status codes
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }

  // Multer rejects an oversized upload before any route handler runs, so it
  // never gets the friendly ValidationError treatment controllers use --
  // this is the only place it can be caught.
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File is too large. Maximum allowed size is 5GB.",
    });
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired",
    });
  }

  // Handle database errors
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Duplicate entry",
    });
  }

  // MySQL 1366: a 4-byte character (emoji, symbol-font glyph) hit a 3-byte `utf8` column.
  // Without this it surfaced as a bare 500 with no hint of what was wrong with the input.
  if (err.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD" || err.errno === 1366) {
    return res.status(400).json({
      success: false,
      message: "The submitted text contains characters that can't be stored (for example emoji). Remove them and try again.",
    });
  }

  if (err.code === "ER_DATA_TOO_LONG") {
    return res.status(400).json({
      success: false,
      message: "One or more fields exceed the maximum allowed length",
    });
  }

  if (err.message && err.message.includes("Unknown column")) {
    return res.status(400).json({
      success: false,
      message: "Invalid query parameters or database schema issue",
    });
  }

  // Default to internal server error
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};
