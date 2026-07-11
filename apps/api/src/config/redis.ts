import { Redis } from "ioredis";
import { env } from "./env.js";

export const redisConnection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

let redisErrorReported = false;

redis.on("error", (error) => {
  if (redisErrorReported) return;
  redisErrorReported = true;
  console.error(`Cache connection failed. Make sure Docker Desktop is running and the cache service is available at ${env.REDIS_URL}.`);
  console.error(error.message);
});

redis.on("ready", () => {
  redisErrorReported = false;
});
