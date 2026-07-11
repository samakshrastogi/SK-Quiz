import type { RequestHandler } from "express";
import { ContentProviderService } from "../ai/ai-provider.service.js";
import { AdaptiveQuizService } from "../services/adaptive-quiz.service.js";
import { AppError, unauthorized } from "../utils/app-error.js";

const quizzes = new AdaptiveQuizService();
const contentProvider = new ContentProviderService();

export const generateQuizQuestions: RequestHandler = async (req, res, next) => {
  try {
    const result = await contentProvider.generateQuestionBatch({
      examName: req.body.examName,
      subject: req.body.subject,
      topics: req.body.topics,
      difficulty: req.body.difficulty,
      count: req.body.questionCount,
      markingStructure: req.body.markingStructure,
      userId: req.user?.id
    });
    res.status(200).json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const startQuiz: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      throw unauthorized();
    }
    const session = await quizzes.startQuiz(req.user.id, req.body);
    res.status(201).json({ data: session, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const submitAttempt: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      throw unauthorized();
    }
    const quizSessionId = req.params["quizSessionId"];
    if (typeof quizSessionId !== "string") {
      throw new AppError(400, "QUIZ_SESSION_ID_REQUIRED", "Quiz session id is required");
    }
    const attempt = await quizzes.submitAttempt(req.user.id, quizSessionId, req.body);
    res.status(201).json({ data: attempt, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};
