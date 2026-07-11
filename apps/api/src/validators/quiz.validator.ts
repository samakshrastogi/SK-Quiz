import { z } from "zod";

export const startQuizSchema = z.object({
  examId: z.string().min(1),
  subjectIds: z.array(z.string()).default([]),
  difficulty: z.enum(["easy", "medium", "hard", "adaptive"]).default("adaptive"),
  questionCount: z.number().int().min(5).max(100).default(20)
});

export const generateQuizQuestionsSchema = z.object({
  examName: z.string().min(2).max(160),
  subject: z.string().min(2).max(160),
  topics: z.array(z.string().min(1).max(160)).min(1).max(30),
  difficulty: z.enum(["easy", "medium", "hard", "adaptive"]).default("adaptive"),
  questionCount: z.number().int().min(5).max(100).default(10),
  markingStructure: z.array(z.string().min(1).max(240)).max(20).default([])
});

export const submitAttemptSchema = z.object({
  questionId: z.string().min(1),
  answer: z.unknown(),
  timeTakenSeconds: z.number().int().min(0).max(7200),
  confidence: z.enum(["guess", "somewhat_sure", "confident", "very_confident"]),
  bookmarked: z.boolean().default(false),
  reviewLater: z.boolean().default(false)
});
