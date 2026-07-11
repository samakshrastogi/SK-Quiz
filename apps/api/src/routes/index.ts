import { Router } from "express";
import { onboardingRoutes } from "./onboarding.routes.js";
import { quizRoutes } from "./quiz.routes.js";
import { adminRoutes } from "./admin.routes.js";
import { profileRoutes } from "./profile.routes.js";
import { mentorRoutes } from "./mentor.routes.js";

export const apiRoutes = Router();

apiRoutes.get("/health", (_req, res) => {
  res.json({ data: { status: "ok" }, requestId: res.getHeader("x-request-id") });
});

apiRoutes.use("/onboarding", onboardingRoutes);
apiRoutes.use("/quizzes", quizRoutes);
apiRoutes.use("/admin", adminRoutes);
apiRoutes.use("/profile", profileRoutes);
apiRoutes.use("/mentor", mentorRoutes);
