import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  name: z.string().min(2).max(80)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().default(false)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email()
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  rememberMe: z.boolean().default(true)
});

export const resendVerificationSchema = z.object({
  email: z.string().email()
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  password: z.string().min(10).max(128)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});
