import { Router } from "express";
import { completeOnboarding, discoverExam, getOnboardingState, saveOnboardingState, suggestExams } from "../controllers/onboarding.controller.js";
import { optionalAuth, requireAuth } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import { examDiscoveryRequestSchema, onboardingSchema, onboardingStateSchema } from "../validators/onboarding.validator.js";

export const onboardingRoutes = Router();

onboardingRoutes.use(optionalAuth);
onboardingRoutes.get("/suggestions", suggestExams);
onboardingRoutes.post("/discover", validateBody(examDiscoveryRequestSchema), discoverExam);
onboardingRoutes.get("/state", getOnboardingState);
onboardingRoutes.put("/state", validateBody(onboardingStateSchema), saveOnboardingState);
onboardingRoutes.post("/", requireAuth, validateBody(onboardingSchema), completeOnboarding);
