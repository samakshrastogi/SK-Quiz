import type { CorsOptions } from "cors";
import { env } from "./env.js";

const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, "");

const withHostnameAlias = (origin: string) => {
  try {
    const url = new URL(origin);
    if (!url.hostname.endsWith("sk-hub.in")) return [origin];
    const alias = new URL(origin);
    alias.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    return [origin, alias.origin];
  } catch {
    return [origin];
  }
};

const configuredOrigins = env.WEB_ORIGIN.split(",").map(normalizeOrigin).filter(Boolean);
const platformOrigins = ["https://quiz.sk-hub.in", "https://www.quiz.sk-hub.in"];

export const allowedWebOrigins = [...new Set([...configuredOrigins.flatMap(withHostnameAlias), ...platformOrigins])];
export const isAllowedWebOrigin = (origin?: string) => !origin || allowedWebOrigins.includes(normalizeOrigin(origin));

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (isAllowedWebOrigin(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by SK Quiz CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};