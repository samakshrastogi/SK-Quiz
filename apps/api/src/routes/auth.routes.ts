import { Router } from "express";
import {
  forgotPassword,
  googleCallback,
  googleStart,
  login,
  logout,
  refresh,
  register,
  resendVerification,
  resetPassword,
  verifyEmail
} from "../controllers/auth.controller.js";
import { validateBody } from "../middlewares/validate.js";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema
} from "../validators/auth.validator.js";

export const authRoutes = Router();

authRoutes.post("/register", validateBody(registerSchema), register);
authRoutes.post("/login", validateBody(loginSchema), login);
authRoutes.post("/verify-email", validateBody(verifyEmailSchema), verifyEmail);
authRoutes.post("/resend-verification", validateBody(resendVerificationSchema), resendVerification);
authRoutes.post("/forgot-password", validateBody(forgotPasswordSchema), forgotPassword);
authRoutes.post("/reset-password", validateBody(resetPasswordSchema), resetPassword);
authRoutes.post("/refresh", validateBody(refreshSchema), refresh);
authRoutes.post("/logout", logout);
authRoutes.get("/google", googleStart);
authRoutes.get("/google/callback", googleCallback);
