import type { NextFunction, Request, Response } from "express";
import { nanoid } from "nanoid";

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.header("x-request-id") ?? nanoid();
  res.setHeader("x-request-id", requestId);
  req.requestId = requestId;
  next();
};
