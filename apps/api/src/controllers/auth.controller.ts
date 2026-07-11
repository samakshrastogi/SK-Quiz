import type { Request, RequestHandler } from "express";
import { env } from "../config/env.js";
import { AuthService } from "../services/auth.service.js";

const auth = new AuthService();

export const register: RequestHandler = async (req, res, next) => {
  try {
    const result = await auth.register(req.body);
    res.status(201).json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const session = await auth.login(req.body);
    res.json({ data: session, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const session = await auth.verifyEmail(req.body);
    res.json({ data: session, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const resendVerification: RequestHandler = async (req, res, next) => {
  try {
    const result = await auth.resendVerification(req.body);
    res.json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword: RequestHandler = async (req, res, next) => {
  try {
    const result = await auth.forgotPassword(req.body);
    res.json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    const result = await auth.resetPassword(req.body);
    res.json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const session = await auth.refresh(req.body.refreshToken);
    res.json({ data: session, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (_req, res) => {
  res.json({ data: { ok: true }, requestId: res.req.requestId });
};

const googleCallbackUrl = (req: Request) =>
  `${req.protocol}://${req.get("host")}${req.baseUrl}/google/callback`;

export const googleStart: RequestHandler = (req, res, next) => {
  try {
    res.redirect(auth.googleAuthUrl(googleCallbackUrl(req)));
  } catch (error) {
    next(error);
  }
};

export const googleCallback: RequestHandler = async (req, res, next) => {
  try {
    const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
    const session = await auth.googleCallback(code, googleCallbackUrl(req));
    const params = new URLSearchParams({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.user.id,
      role: session.user.role
    });
    res.redirect(`${env.WEB_ORIGIN.replace(/\/$/, "")}/auth/google/callback?${params.toString()}`);
  } catch (error) {
    next(error);
  }
};
