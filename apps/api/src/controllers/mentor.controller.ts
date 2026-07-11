import type { RequestHandler } from "express";
import { z } from "zod";
import { ContentProviderService } from "../ai/ai-provider.service.js";
import { unauthorized } from "../utils/app-error.js";

const contentProvider = new ContentProviderService();

const mentorBodySchema = z.object({
  question: z.string().min(1).max(1500),
  examName: z.string().optional().default("Current exam"),
  nextTask: z.string().optional(),
  weakTopics: z.array(z.string()).optional().default([]),
  strongTopics: z.array(z.string()).optional().default([]),
  recentAccuracy: z.number().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "mentor"]),
        text: z.string().max(3000)
      })
    )
    .optional()
    .default([])
});

export const askMentor: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized();
    const input = mentorBodySchema.parse(req.body);
    const result = await contentProvider.generateMentorAnswer({ ...input, userId: req.user.id });
    res.status(200).json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};
