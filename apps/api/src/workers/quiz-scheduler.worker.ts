import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { NotificationModel } from "../models/core.model.js";

export const createQuizSchedulerWorker = () => {
  let errorReported = false;
  const worker = new Worker(
    "quiz-scheduler",
    async (job) => {
      await NotificationModel.create({
        title: "Quiz reminder",
        body: "Your scheduled quiz is ready.",
        channel: "in_app",
        deliverAt: new Date(),
        scheduledQuizId: job.data.scheduledQuizId
      });
    },
    { connection: redisConnection }
  );

  worker.on("error", (error) => {
    if (errorReported) return;
    errorReported = true;
    console.error("Quiz scheduler worker could not connect to the cache service. Make sure Docker Desktop and the cache service are running.");
    console.error(error.message);
  });

  worker.on("ready", () => {
    errorReported = false;
  });

  return worker;
};
