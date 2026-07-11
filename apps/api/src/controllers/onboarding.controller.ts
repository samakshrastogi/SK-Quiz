import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { isProduction } from "../config/env.js";
import { OnboardingStateModel } from "../models/core.model.js";
import { ExamService } from "../services/exam.service.js";
import { unauthorized } from "../utils/app-error.js";

const exams = new ExamService();
const onboardingSessionCookie = "aqc_onboarding_session";

const getOnboardingSessionId = (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => {
  const existing = typeof req.cookies?.[onboardingSessionCookie] === "string" ? req.cookies[onboardingSessionCookie] : undefined;
  if (existing) return existing;

  const sessionId = randomUUID();
  res.cookie(onboardingSessionCookie, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 365
  });
  return sessionId;
};

const stateQuery = (userId: string | undefined, sessionId: string) => (userId ? { userId } : { sessionId });
const hasSavedSetup = (state: unknown) => {
  if (!state || typeof state !== "object") return false;
  const value = state as {
    discoveredExams?: unknown[];
    selectedExamIds?: unknown[];
    subjectPreferences?: unknown[];
    plan?: unknown[];
    quizHistory?: unknown[];
    completedTopics?: unknown[];
  };
  return [value.discoveredExams, value.selectedExamIds, value.subjectPreferences, value.plan, value.quizHistory, value.completedTopics].some(
    (items) => Array.isArray(items) && items.length > 0
  );
};

export const discoverExam: RequestHandler = async (req, res, next) => {
  try {
    const result = await exams.discoverExamDetails(req.body.examName, req.user?.id);
    res.status(200).json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const getOnboardingState: RequestHandler = async (req, res, next) => {
  try {
    const sessionId = getOnboardingSessionId(req, res);
    let saved = await OnboardingStateModel.findOne(stateQuery(req.user?.id, sessionId));
    if (req.user?.id && !saved) {
      const sessionSaved = await OnboardingStateModel.findOne({ sessionId });
      if (sessionSaved && hasSavedSetup(sessionSaved.state)) {
        saved = await OnboardingStateModel.findOneAndUpdate(
          { userId: req.user.id },
          { userId: req.user.id, sessionId, state: sessionSaved.state },
          { new: true, upsert: true }
        );
      }
    }
    res.status(200).json({ data: saved?.state ?? {}, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const saveOnboardingState: RequestHandler = async (req, res, next) => {
  try {
    const sessionId = getOnboardingSessionId(req, res);
    const query = stateQuery(req.user?.id, sessionId);
    let existing = await OnboardingStateModel.findOne(query);
    if (req.user?.id && !existing) {
      const sessionSaved = await OnboardingStateModel.findOne({ sessionId });
      if (sessionSaved && hasSavedSetup(sessionSaved.state)) {
        existing = await OnboardingStateModel.findOneAndUpdate(
          { userId: req.user.id },
          { userId: req.user.id, sessionId, state: sessionSaved.state },
          { new: true, upsert: true }
        );
      }
    }
    if (existing && hasSavedSetup(existing.state) && !hasSavedSetup(req.body.state)) {
      res.status(200).json({ data: existing.state, requestId: req.requestId });
      return;
    }
    const saved = await OnboardingStateModel.findOneAndUpdate(
      query,
      { userId: req.user?.id, sessionId, state: req.body.state },
      { new: true, upsert: true }
    );
    res.status(200).json({ data: saved.state, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const completeOnboarding: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      throw unauthorized();
    }
    const result = await exams.completeOnboarding(req.user.id, req.body);
    res.status(201).json({ data: result, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};
