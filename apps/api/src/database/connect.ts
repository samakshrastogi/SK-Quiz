import mongoose from "mongoose";
import { env } from "../config/env.js";

export const connectDatabase = async () => {
  mongoose.set("strictQuery", true);
  mongoose.set("bufferCommands", false);
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      autoIndex: env.NODE_ENV !== "production",
      serverSelectionTimeoutMS: 10_000
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database connection error";
    throw new Error(`Database connection failed at ${env.MONGODB_URI}. Make sure Docker Desktop is running and the database service is started. ${message}`);
  }
};
