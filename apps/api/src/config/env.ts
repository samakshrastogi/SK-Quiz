import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(currentDir, "../../../../.env"),
  resolve(currentDir, "../../.env")
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));
loadDotenv(envPath ? { path: envPath } : undefined);

const optionalEnv = z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4001),
  WEB_ORIGIN: z.string().url().default("http://localhost:5474"),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  GOOGLE_CLIENT_ID: optionalEnv,
  GOOGLE_CLIENT_SECRET: optionalEnv,
  RESEND_API_KEY: optionalEnv,
  MAIL_FROM: optionalEnv,
  SMTP_HOST: optionalEnv,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalEnv,
  SMTP_PASS: optionalEnv,
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AI_PROVIDER_API_KEY: optionalEnv,
  AI_PROVIDER_MODEL: optionalEnv,
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  PASSWORD_RESET_URL: z.string().url().optional(),
  VERIFY_EMAIL_URL: z.string().url().optional(),
  SK_CENTRAL_SERVICE_TOKEN: optionalEnv,
  SK_CENTRAL_AUTH_URL: z.string().url().default("http://localhost:4002/api"),
  SK_CENTRAL_LOGIN_URL: z.string().url().default("http://localhost:5475/login"),
  SK_CENTRAL_SSO_SECRET: z.string().min(32).default("sk-central-local-sso-secret-change-in-production")
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";
