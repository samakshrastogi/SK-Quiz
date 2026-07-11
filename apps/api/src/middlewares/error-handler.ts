import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const logError = () => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${req.requestId}] ${req.method} ${req.originalUrl} failed: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  };

  if (error instanceof ZodError) {
    logError();
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten()
      },
      requestId: req.requestId
    });
  }

  if (error instanceof AppError) {
    logError();
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      requestId: req.requestId
    });
  }

  logError();
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong"
    },
    requestId: req.requestId
  });
};
