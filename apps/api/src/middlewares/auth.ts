import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@ai-quiz-coach/shared";
import { env } from "../config/env.js";
import { ProfileModel, UserModel } from "../models/core.model.js";
import { forbidden, unauthorized } from "../utils/app-error.js";

interface CentralTokenPayload {
  iss: "sk-central";
  aud: string;
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  permissions?: string[];
  sid: string;
  exp: number;
}

const isUsableCentralPayload = (payload: CentralTokenPayload | null | undefined) =>
  Boolean(
    payload
      && payload.iss === "sk-central"
      && payload.aud === "sk-quiz"
      && payload.sub
      && payload.email
      && payload.exp > Math.floor(Date.now() / 1000)
  );

const verifyCentralTokenLocally = (token: string): CentralTokenPayload | null => {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;
    const expected = crypto.createHmac("sha256", env.SK_CENTRAL_SSO_SECRET).update(`${header}.${body}`).digest("base64url");
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CentralTokenPayload;
    return isUsableCentralPayload(payload) ? payload : null;
  } catch {
    return null;
  }
};

const verifyCentralTokenRemotely = async (token: string): Promise<CentralTokenPayload | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${env.SK_CENTRAL_AUTH_URL.replace(/\/$/, "")}/auth/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, appId: "sk-quiz" }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const result = await response.json() as { data?: { valid?: boolean; payload?: CentralTokenPayload } };
    const payload = result.data?.payload;
    return result.data?.valid && isUsableCentralPayload(payload) ? payload ?? null : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const verifyCentralToken = async (token: string) =>
  verifyCentralTokenLocally(token) ?? await verifyCentralTokenRemotely(token);

const syncCentralUser = async (payload: CentralTokenPayload) => {
  const displayName = payload.name || payload.email.split("@")[0] || "Student";
  const profilePatch = {
    name: displayName
  };
  let user = await UserModel.findOne({ skCentralUserId: payload.sub }).select("_id email role lastActivityAt skCentralUserId");
  user = user ?? await UserModel.findOne({ email: payload.email.toLowerCase() }).select("_id email role lastActivityAt skCentralUserId");
  if (!user) {
    user = await UserModel.create({
      email: payload.email.toLowerCase(),
      skCentralUserId: payload.sub,
      role: payload.role ?? "student",
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      lastActivityAt: new Date()
    });
    await ProfileModel.create({ userId: user._id, ...profilePatch });
  } else {
    user.skCentralUserId = payload.sub;
    user.email = payload.email.toLowerCase();
    user.role = payload.role ?? user.role;
    user.lastActivityAt = new Date();
    await user.save();
    await ProfileModel.updateOne({ userId: user._id }, { $set: profilePatch }, { upsert: true });
  }
  return user;
};
const authenticateToken = async (token: string) => {
  const centralPayload = await verifyCentralToken(token);
  if (!centralPayload) throw unauthorized("Invalid or expired SK Central token");
  const user = await syncCentralUser(centralPayload);
  return { id: String(user._id), role: user.role as UserRole };
};

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) return next(unauthorized());

  try {
    req.user = await authenticateToken(token);
    return next();
  } catch (error) {
    return next(error instanceof Error && "statusCode" in error ? error : unauthorized("Invalid or expired token"));
  }
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) return next();

  try {
    req.user = await authenticateToken(token);
  } catch {
    req.user = undefined;
  }
  return next();
};

export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };

