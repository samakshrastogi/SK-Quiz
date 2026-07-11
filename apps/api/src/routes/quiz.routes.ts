import { Router } from "express";
import { generateQuizQuestions, startQuiz, submitAttempt } from "../controllers/quiz.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import { generateQuizQuestionsSchema, startQuizSchema, submitAttemptSchema } from "../validators/quiz.validator.js";

export const quizRoutes = Router();

quizRoutes.post("/generate", validateBody(generateQuizQuestionsSchema), generateQuizQuestions);
quizRoutes.post("/", requireAuth, validateBody(startQuizSchema), startQuiz);
quizRoutes.post("/:quizSessionId/attempts", requireAuth, validateBody(submitAttemptSchema), submitAttempt);
