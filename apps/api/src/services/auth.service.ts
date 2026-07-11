import net from "node:net";
import tls from "node:tls";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserRole } from "@ai-quiz-coach/shared";
import { env } from "../config/env.js";
import { AuthActivityModel, AuthOtpModel, ProfileModel } from "../models/core.model.js";
import { AppError } from "../utils/app-error.js";
import { UserRepository } from "../repositories/user.repository.js";

const users = new UserRepository();
const OTP_TTL_MS = 10 * 60 * 1000;
const INACTIVITY_TTL_MS = 48 * 60 * 60 * 1000;

const signAccessToken = (userId: string, role: UserRole) =>
  jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.JWT_ACCESS_TTL
  } as SignOptions);

const signRefreshToken = (userId: string, role: UserRole, rememberMe: boolean) =>
  jwt.sign({ role, rememberMe }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    expiresIn: rememberMe ? env.JWT_REFRESH_TTL : "7d"
  } as SignOptions);

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const smtpConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

const readSmtpResponse = (socket: net.Socket) =>
  new Promise<string>((resolve, reject) => {
    let buffer = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.trimEnd().split(/\r?\n/);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });

const sendSmtpCommand = async (socket: net.Socket, command: string, expected: number[]) => {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) {
    throw new AppError(502, "SMTP_DELIVERY_FAILED", `SMTP command failed with ${code}`);
  }
  return response;
};

const connectSmtp = () =>
  new Promise<net.Socket>((resolve, reject) => {
    const port = env.SMTP_PORT;
    const host = env.SMTP_HOST;
    if (!host) {
      reject(new AppError(500, "SMTP_NOT_CONFIGURED", "SMTP host is missing"));
      return;
    }
    const secure = env.SMTP_SECURE || port === 465;
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    socket.once("error", reject);
    socket.once(secure ? "secureConnect" : "connect", async () => {
      try {
        await readSmtpResponse(socket);
        resolve(socket);
      } catch (error) {
        reject(error);
      }
    });
  });

const upgradeToTls = async (socket: net.Socket) =>
  new Promise<tls.TLSSocket>((resolve, reject) => {
    const host = env.SMTP_HOST;
    if (!host) {
      reject(new AppError(500, "SMTP_NOT_CONFIGURED", "SMTP host is missing"));
      return;
    }
    const secureSocket = tls.connect({ socket, servername: host }, () => resolve(secureSocket));
    secureSocket.once("error", reject);
  });

const sendSmtpEmail = async (input: { to: string; subject: string; html: string; text: string }) => {
  let socket = await connectSmtp();
  await sendSmtpCommand(socket, "EHLO sk-quiz.local", [250]);
  if (!env.SMTP_SECURE && env.SMTP_PORT !== 465) {
    await sendSmtpCommand(socket, "STARTTLS", [220]);
    socket = await upgradeToTls(socket);
    await sendSmtpCommand(socket, "EHLO sk-quiz.local", [250]);
  }

  await sendSmtpCommand(socket, "AUTH LOGIN", [334]);
  await sendSmtpCommand(socket, Buffer.from(env.SMTP_USER ?? "").toString("base64"), [334]);
  await sendSmtpCommand(socket, Buffer.from(env.SMTP_PASS ?? "").toString("base64"), [235]);

  const from = env.MAIL_FROM || env.SMTP_USER || "no-reply@localhost";
  await sendSmtpCommand(socket, `MAIL FROM:<${env.SMTP_USER}>`, [250]);
  await sendSmtpCommand(socket, `RCPT TO:<${input.to}>`, [250, 251]);
  await sendSmtpCommand(socket, "DATA", [354]);

  const boundary = `sk-quiz-${Date.now()}`;
  const message = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    input.html,
    "",
    `--${boundary}--`
  ]
    .join("\r\n")
    .replace(/^\./gm, "..");

  await sendSmtpCommand(socket, `${message}\r\n.`, [250]);
  await sendSmtpCommand(socket, "QUIT", [221]);
  socket.end();
};

const deliverOtp = async (email: string, otp: string, purpose: "verify_email" | "reset_password") => {
  const label = purpose === "verify_email" ? "Email verification" : "Password reset";
  const subject = `SK Quiz Coach ${label} OTP`;
  const html = `<p>Your SK Quiz Coach OTP is:</p><h1>${otp}</h1><p>This code expires in 10 minutes.</p>`;
  const text = `Your SK Quiz Coach OTP is ${otp}. This code expires in 10 minutes.`;
  if (smtpConfigured()) {
    await sendSmtpEmail({ to: email, subject, html, text });
    return;
  }
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: email,
        subject,
        html
      })
    });
    if (!response.ok) {
      throw new AppError(502, "EMAIL_DELIVERY_FAILED", "Could not send OTP email");
    }
    return;
  }
  console.info(`[SK Quiz Coach] ${label} OTP for ${email}: ${otp}`);
};

export class AuthService {
  async register(input: { email: string; password: string; name: string }) {
    const email = normalizeEmail(input.email);
    const existing = await users.findByEmail(email);
    if (existing?.emailVerifiedAt) {
      throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered");
    }

    if (!existing) {
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await users.create({ email, passwordHash });
      await ProfileModel.create({ userId: user._id, name: input.name });
    }

    await this.sendOtp(email, "verify_email");
    await AuthActivityModel.create({ userId: existing?._id, email, event: "register_started", provider: "email" });
    return { requiresVerification: true, email };
  }

  async login(input: { email: string; password: string; rememberMe: boolean }) {
    const email = normalizeEmail(input.email);
    const user = await users.findByEmail(email);
    if (!user?.passwordHash) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    if (!user.emailVerifiedAt) {
      await this.sendOtp(email, "verify_email");
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email with the OTP sent to your inbox");
    }

    user.lastLoginAt = new Date();
    user.lastActivityAt = new Date();
    await user.save();
    await AuthActivityModel.create({ userId: user._id, email, event: "login", provider: "email" });

    return this.issueSession(String(user._id), user.role as UserRole, input.rememberMe);
  }

  async verifyEmail(input: { email: string; otp: string; rememberMe?: boolean }) {
    const email = normalizeEmail(input.email);
    await this.verifyOtp(email, "verify_email", input.otp);
    const user = await users.findByEmail(email);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Account not found");
    }

    user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
    user.lastLoginAt = new Date();
    user.lastActivityAt = new Date();
    await user.save();
    await AuthActivityModel.create({ userId: user._id, email, event: "email_verified", provider: "email" });

    return this.issueSession(String(user._id), user.role as UserRole, Boolean(input.rememberMe));
  }

  async resendVerification(input: { email: string }) {
    const email = normalizeEmail(input.email);
    const user = await users.findByEmail(email);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Account not found");
    }
    if (user.emailVerifiedAt) {
      return { alreadyVerified: true };
    }
    await this.sendOtp(email, "verify_email");
    return { sent: true };
  }

  async forgotPassword(input: { email: string }) {
    const email = normalizeEmail(input.email);
    const user = await users.findByEmail(email);
    if (user) {
      await this.sendOtp(email, "reset_password");
    }
    return { sent: true };
  }

  async resetPassword(input: { email: string; otp: string; password: string }) {
    const email = normalizeEmail(input.email);
    await this.verifyOtp(email, "reset_password", input.otp);
    const user = await users.findByEmail(email);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Account not found");
    }

    user.passwordHash = await bcrypt.hash(input.password, 12);
    user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
    user.lastActivityAt = new Date();
    await user.save();
    await AuthActivityModel.create({ userId: user._id, email, event: "password_reset", provider: "email" });
    return { updated: true };
  }

  googleAuthUrl(callbackUrl: string) {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new AppError(503, "GOOGLE_SSO_NOT_CONFIGURED", "Google SSO is not configured yet");
    }
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async googleCallback(code: string, callbackUrl: string) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new AppError(503, "GOOGLE_SSO_NOT_CONFIGURED", "Google SSO is not configured yet");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code"
      })
    });

    if (!tokenResponse.ok) {
      throw new AppError(502, "GOOGLE_TOKEN_FAILED", "Google could not complete sign in");
    }

    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new AppError(502, "GOOGLE_TOKEN_FAILED", "Google did not return an access token");
    }

    const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokenJson.access_token}` }
    });
    if (!userInfoResponse.ok) {
      throw new AppError(502, "GOOGLE_PROFILE_FAILED", "Google profile could not be loaded");
    }

    const googleUser = (await userInfoResponse.json()) as { sub: string; email?: string; name?: string; picture?: string };
    if (!googleUser.email) {
      throw new AppError(400, "GOOGLE_EMAIL_MISSING", "Google account did not return an email address");
    }

    const email = normalizeEmail(googleUser.email);
    let user = await users.findByGoogleId(googleUser.sub);
    user = user ?? (await users.findByEmail(email));
    if (!user) {
      user = await users.create({ email, googleId: googleUser.sub, emailVerifiedAt: new Date() });
      await ProfileModel.create({ userId: user._id, name: googleUser.name ?? email.split("@")[0] ?? "Student", avatarUrl: googleUser.picture });
    } else {
      user.googleId = googleUser.sub;
      user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
      await ProfileModel.updateOne(
        { userId: user._id },
        { $set: { ...(googleUser.name ? { name: googleUser.name } : {}), ...(googleUser.picture ? { avatarUrl: googleUser.picture } : {}) } },
        { upsert: false }
      );
    }

    user.lastLoginAt = new Date();
    user.lastActivityAt = new Date();
    await user.save();
    await AuthActivityModel.create({ userId: user._id, email, event: "google_login", provider: "google" });
    return this.issueSession(String(user._id), user.role as UserRole, true);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string; role: UserRole; rememberMe?: boolean };
      const user = await users.findById(payload.sub);
      if (!user) {
        throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
      }
      const lastActivityAt = user.lastActivityAt?.getTime() ?? 0;
      if (Date.now() - lastActivityAt > INACTIVITY_TTL_MS) {
        throw new AppError(401, "SESSION_INACTIVE", "Session expired after 48 hours of inactivity");
      }
      user.lastActivityAt = new Date();
      await user.save();
      return this.issueSession(String(user._id), user.role as UserRole, Boolean(payload.rememberMe));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token");
    }
  }

  issueSession(userId: string, role: UserRole, rememberMe: boolean) {
    return {
      accessToken: signAccessToken(userId, role),
      refreshToken: signRefreshToken(userId, role, rememberMe),
      expiresAfterInactivityMs: INACTIVITY_TTL_MS,
      user: { id: userId, role }
    };
  }

  private async sendOtp(email: string, purpose: "verify_email" | "reset_password") {
    const otp = generateOtp();
    await AuthOtpModel.updateMany({ email, purpose, consumedAt: { $exists: false } }, { consumedAt: new Date() });
    await AuthOtpModel.create({
      email,
      purpose,
      otpHash: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + OTP_TTL_MS)
    });
    await deliverOtp(email, otp, purpose);
  }

  private async verifyOtp(email: string, purpose: "verify_email" | "reset_password", otp: string) {
    const record = await AuthOtpModel.findOne({
      email,
      purpose,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!record) {
      throw new AppError(400, "OTP_EXPIRED", "OTP expired or not found");
    }
    if (record.attempts >= 5) {
      throw new AppError(429, "OTP_LOCKED", "Too many OTP attempts. Request a fresh OTP");
    }

    const valid = await bcrypt.compare(otp, record.otpHash);
    if (!valid) {
      record.attempts += 1;
      await record.save();
      throw new AppError(400, "OTP_INVALID", "Invalid OTP");
    }

    record.consumedAt = new Date();
    await record.save();
  }
}
