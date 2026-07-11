import type { AdaptiveDecision, QuestionDifficulty } from "@ai-quiz-coach/shared";
import { QuestionAttemptModel, QuestionBankModel, QuizSessionModel, RevisionQueueModel } from "../models/core.model.js";
import { AppError } from "../utils/app-error.js";

const difficultyOrder: QuestionDifficulty[] = ["easy", "medium", "hard"];

const moveDifficulty = (current: QuestionDifficulty, delta: number): QuestionDifficulty => {
  const index = difficultyOrder.indexOf(current);
  return difficultyOrder[Math.min(Math.max(index + delta, 0), difficultyOrder.length - 1)] ?? current;
};

export class AdaptiveQuizService {
  decideNextDifficulty(current: QuestionDifficulty, accuracy: number): AdaptiveDecision {
    if (accuracy > 85) {
      return { nextDifficulty: moveDifficulty(current, 1), reason: "Accuracy above 85%" };
    }
    if (accuracy < 50) {
      return { nextDifficulty: moveDifficulty(current, -1), reason: "Accuracy below 50%" };
    }
    return { nextDifficulty: current, reason: "Accuracy in maintenance band" };
  }

  async startQuiz(userId: string, input: { examId: string; subjectIds: string[]; difficulty: string; questionCount: number }) {
    const query = {
      examId: input.examId,
      ...(input.subjectIds.length > 0 ? { subjectId: { $in: input.subjectIds } } : {}),
      ...(input.difficulty !== "adaptive" ? { difficulty: input.difficulty } : {})
    };
    const questions = await QuestionBankModel.find(query).limit(input.questionCount);
    if (questions.length === 0) {
      throw new AppError(404, "QUESTION_BATCH_EMPTY", "No questions are available yet for this quiz");
    }

    return QuizSessionModel.create({
      userId,
      examId: input.examId,
      questionIds: questions.map((question) => question._id),
      startedAt: new Date(),
      status: "in_progress"
    });
  }

  async submitAttempt(userId: string, quizSessionId: string, input: { questionId: string; answer: unknown; timeTakenSeconds: number; confidence: string; bookmarked: boolean; reviewLater: boolean }) {
    const question = await QuestionBankModel.findById(input.questionId);
    if (!question) {
      throw new AppError(404, "QUESTION_NOT_FOUND", "Question not found");
    }

    const isCorrect = JSON.stringify(question.correctAnswer) === JSON.stringify(input.answer);
    const attempt = await QuestionAttemptModel.create({
      userId,
      quizSessionId,
      questionId: input.questionId,
      answer: input.answer,
      isCorrect,
      timeTakenSeconds: input.timeTakenSeconds,
      confidence: input.confidence,
      bookmarked: input.bookmarked,
      reviewLater: input.reviewLater
    });

    if (!isCorrect) {
      await RevisionQueueModel.create({
        userId,
        questionId: input.questionId,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        intervalDays: 1
      });
    }

    return attempt;
  }
}
