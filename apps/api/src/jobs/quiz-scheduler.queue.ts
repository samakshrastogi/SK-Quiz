import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const quizSchedulerQueue = new Queue("quiz-scheduler", {
  connection: redisConnection
});

export const scheduleQuizReminder = async (scheduledQuizId: string, deliverAt: Date) => {
  await quizSchedulerQueue.add(
    "quiz-reminder",
    { scheduledQuizId },
    {
      delay: Math.max(deliverAt.getTime() - Date.now(), 0),
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true
    }
  );
};
