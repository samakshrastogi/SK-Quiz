import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { getAdminAnalytics, makeUsersAdmin } from "../controllers/admin.controller.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";

export const adminRoutes = Router();

const requireAnalyticsAccess = (req: Request, res: Response, next: NextFunction) => {
  const serviceToken = req.header("x-sk-central-token");
  if (env.SK_CENTRAL_SERVICE_TOKEN && serviceToken === env.SK_CENTRAL_SERVICE_TOKEN) {
    return next();
  }

  return requireAuth(req, res, (authError?: unknown) => {
    if (authError) return next(authError);
    return requireRole("admin", "super_admin")(req, res, next);
  });
};

adminRoutes.get("/analytics", requireAnalyticsAccess, getAdminAnalytics);
adminRoutes.post("/make-admin", requireAuth, requireRole("admin", "super_admin"), makeUsersAdmin);
