import { Router } from "express";
import { getProfileAnalytics, recordPlatformUsage } from "../controllers/profile.controller.js";
import { requireAuth } from "../middlewares/auth.js";

export const profileRoutes = Router();

profileRoutes.get("/analytics", requireAuth, getProfileAnalytics);
profileRoutes.post("/usage", requireAuth, recordPlatformUsage);
