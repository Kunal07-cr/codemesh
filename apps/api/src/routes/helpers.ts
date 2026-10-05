import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function parseBody<T>(schema: ZodSchema<T>, req: Request): T {
  return schema.parse(req.body);
}

export function ok<T>(res: Response, data: T) {
  res.json({ data });
}
