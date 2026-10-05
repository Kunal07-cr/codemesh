import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ZIP_UPLOAD_LIMIT_MB } from "@codemesh/shared";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export function notFound(message = "Resource not found") {
  return new HttpError(404, "NOT_FOUND", message);
}

export function forbidden(message = "Forbidden") {
  return new HttpError(403, "FORBIDDEN", message);
}

export function unauthorized(message = "Authentication required") {
  return new HttpError(401, "UNAUTHORIZED", message);
}

export function badRequest(message = "Bad request", details?: unknown) {
  return new HttpError(400, "BAD_REQUEST", message, details);
}

export function conflict(message = "Conflict", details?: unknown) {
  return new HttpError(409, "CONFLICT", message, details);
}

export function failedDependency(message = "External integration is not configured", details?: unknown) {
  return new HttpError(424, "NOT_CONFIGURED", message, details);
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.id;
  if (isUploadSizeError(error)) {
    res.status(413).json({
      error: {
        code: "UPLOAD_TOO_LARGE",
        message: `ZIP archive exceeds the ${ZIP_UPLOAD_LIMIT_MB} MB upload limit.`,
        requestId
      }
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details, requestId }
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Validation failed", details: error.flatten(), requestId }
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown server error";
  req.log.error({ err: error }, message);
  res.status(500).json({
    error: { code: "INTERNAL_SERVER_ERROR", message, requestId }
  });
}

function isUploadSizeError(error: unknown): error is Error & { code: "LIMIT_FILE_SIZE" } {
  return error instanceof Error && "code" in error && error.code === "LIMIT_FILE_SIZE";
}

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}
