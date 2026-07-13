import type { RequestHandler } from "express";
import {
  AchievementModel,
  AnalyticsModel,
  OnboardingStateModel,
  ProfileModel,
  QuestionAttemptModel,
  QuizSessionModel,
  RevisionQueueModel,
  ScheduledQuizModel,
  TargetExamModel,
  UserModel
} from "../models/core.model.js";
import { unauthorized } from "../utils/app-error.js";

interface ExamSummary {
  id?: string;
  examName: string;
}

interface PlanTask {
  id?: string;
  date?: string;
  examName?: string;
  subject?: string;
  topic?: string;
  durationHours?: number;
  done?: boolean;
  completed?: boolean;
  skipped?: boolean;
  postponed?: boolean;
  carryForward?: boolean;
}

interface QuizHistoryItem {
  id?: string;
  date?: string;
  time?: string;
  examName?: string;
  topic?: string;
  status?: string;
  score?: number;
  totalQuestions?: number;
  accuracy?: number;
  durationMinutes?: number;
}

interface SavedState {
  discoveredExams?: ExamSummary[];
  selectedExamIds?: string[];
  activeExamId?: string;
  plan?: PlanTask[];
  quizHistory?: QuizHistoryItem[];
  completedTopics?: string[];
  quizTime?: string;
  dailyHours?: number;
  weeklyHours?: number;
}

const asState = (value: unknown): SavedState => (value && typeof value === "object" ? (value as SavedState) : {});
const examKey = (exam: ExamSummary) => exam.id ?? exam.examName.trim().toLowerCase();
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const dateOnly = (value?: Date | string | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const round = (value: number, decimals = 1) => Number(value.toFixed(decimals));
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const createdAtOf = (value: unknown) => (value && typeof value === "object" && "createdAt" in value ? (value as { createdAt?: Date | string | null }).createdAt : undefined);

const streakFromDates = (dates: string[]) => {
  const unique = new Set(dates.filter(Boolean));
  let cursor = new Date();
  let streak = 0;
  while (unique.has(dateOnly(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  let longest = 0;
  let current = 0;
  const sorted = [...unique].sort();
  sorted.forEach((date, index) => {
    const previous = sorted[index - 1];
    const diff = previous ? (new Date(date).getTime() - new Date(previous).getTime()) / (24 * 60 * 60 * 1000) : 1;
    current = diff === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  });
  return { current: streak, longest };
};

const timeSlot = (time?: string) => {
  const hour = Number((time ?? "").split(":")[0]);
  if (Number.isNaN(hour)) return "Not enough data";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Night";
};

export const getProfileAnalytics: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized();

    const [user, profile, saved, sessions, attempts, scheduled, revisions, achievements, exams] = await Promise.all([
      UserModel.findById(req.user.id).lean(),
      ProfileModel.findOne({ userId: req.user.id }).lean(),
      OnboardingStateModel.findOne({ userId: req.user.id }).lean(),
      QuizSessionModel.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(500).lean(),
      QuestionAttemptModel.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(5000).populate("questionId").lean(),
      ScheduledQuizModel.find({ userId: req.user.id }).sort({ scheduledAt: 1 }).limit(100).lean(),
      RevisionQueueModel.find({ userId: req.user.id }).sort({ dueAt: 1 }).limit(500).lean(),
      AchievementModel.find().limit(100).lean(),
      TargetExamModel.find().select("_id name normalizedName suggestedStudyDurationWeeks").lean()
    ]);

    const state = asState(saved?.state);
    const selectedExams = state.discoveredExams ?? [];
    const activeExam = selectedExams.find((exam) => examKey(exam) === state.activeExamId) ?? selectedExams[0];
    const activeExamName = activeExam?.examName;
    const activeExamRecord = exams.find((exam) => String(exam._id) === activeExam?.id || exam.name === activeExamName);

    const plan = (state.plan ?? []).filter((task) => !activeExamName || task.examName === activeExamName);
    const history = (state.quizHistory ?? []).filter((item) => !activeExamName || item.examName === activeExamName);
    const completedHistory = history.filter((item) => (item.status ?? "").toLowerCase() === "completed");
    const relevantSessions = sessions.filter((session) => !activeExamRecord || String(session.examId) === String(activeExamRecord._id));
    const relevantAttempts = attempts.filter((attempt) => {
      const question = attempt.questionId as { examId?: unknown; subjectId?: unknown; topicId?: unknown; difficulty?: string; marks?: number; negativeMarks?: number } | null;
      return !activeExamRecord || String(question?.examId ?? "") === String(activeExamRecord._id);
    });

    const today = todayKey();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date();
    monthStart.setDate(1);

    const isDone = (task: PlanTask) => Boolean(task.done || task.completed || (task.topic && (state.completedTopics ?? []).includes(task.topic)));
    const completedTasks = plan.filter(isDone);
    const pendingTasks = plan.filter((task) => !isDone(task) && !task.skipped);
    const overdueTasks = pendingTasks.filter((task) => (task.date ?? today) < today);
    const upcomingTask = pendingTasks.find((task) => (task.date ?? "") >= today) ?? pendingTasks[0];
    const upcomingQuiz = scheduled.find((quiz) => !quiz.status || ["scheduled", "ready"].includes(String(quiz.status))) ?? null;

    const plannedHours = plan.reduce((sum, task) => sum + (task.durationHours ?? 0), 0);
    const completedHours = completedTasks.reduce((sum, task) => sum + (task.durationHours ?? 0), 0);
    const actualHours = completedHours + relevantAttempts.reduce((sum, attempt) => sum + ((attempt.timeTakenSeconds ?? 0) / 3600), 0);
    const studyDates = completedTasks.map((task) => task.date ?? "").filter(Boolean);
    const quizDates = [...completedHistory.map((item) => item.date ?? ""), ...relevantSessions.map((session) => dateOnly(session.completedAt ?? session.startedAt ?? createdAtOf(session)))].filter(Boolean);
    const streak = streakFromDates([...studyDates, ...quizDates]);

    const correctAnswers = relevantAttempts.filter((attempt) => attempt.isCorrect).length;
    const wrongAnswers = relevantAttempts.filter((attempt) => attempt.isCorrect === false).length;
    const skippedQuestions = Math.max(0, relevantSessions.reduce((sum, session) => sum + (session.questionIds?.length ?? 0), 0) - relevantAttempts.length);
    const positiveMarks = relevantAttempts.reduce((sum, attempt) => {
      const question = attempt.questionId as { marks?: number } | null;
      return sum + (attempt.isCorrect ? question?.marks ?? 1 : 0);
    }, 0);
    const negativeMarks = relevantAttempts.reduce((sum, attempt) => {
      const question = attempt.questionId as { negativeMarks?: number } | null;
      return sum + (attempt.isCorrect === false ? question?.negativeMarks ?? 0 : 0);
    }, 0);
    const totalQuestions = Math.max(
      relevantAttempts.length,
      completedHistory.reduce((sum, item) => sum + (item.totalQuestions ?? 0), 0)
    );
    const overallAccuracy = relevantAttempts.length > 0 ? percent(correctAnswers, relevantAttempts.length) : Math.round(average(completedHistory.map((item) => item.accuracy ?? 0)));
    const averageScore = Math.round(average([...relevantSessions.map((session) => session.score ?? 0), ...completedHistory.map((item) => item.score ?? 0)].filter((value) => value > 0)));
    const scores = [...relevantSessions.map((session) => session.score ?? 0), ...completedHistory.map((item) => item.score ?? 0)].filter((value) => value > 0);
    const timeValues = relevantAttempts.map((attempt) => attempt.timeTakenSeconds ?? 0).filter((value) => value > 0);
    const quizDurations = relevantSessions.map((session) => {
      const start = session.startedAt ? new Date(session.startedAt).getTime() : 0;
      const end = session.completedAt ? new Date(session.completedAt).getTime() : 0;
      return start > 0 && end > start ? (end - start) / 60000 : 0;
    }).filter((value) => value > 0);

    const subjectMap = new Map<string, { subject: string; planned: number; done: number; hours: number; questions: number; correct: number; quizzes: number; revisions: number; topics: Set<string>; remaining: Set<string> }>();
    for (const task of plan) {
      const subject = task.subject ?? "General";
      const bucket = subjectMap.get(subject) ?? { subject, planned: 0, done: 0, hours: 0, questions: 0, correct: 0, quizzes: 0, revisions: 0, topics: new Set<string>(), remaining: new Set<string>() };
      bucket.planned += 1;
      bucket.hours += task.durationHours ?? 0;
      if (task.topic) bucket.topics.add(task.topic);
      if (isDone(task)) bucket.done += 1;
      else if (task.topic) bucket.remaining.add(task.topic);
      subjectMap.set(subject, bucket);
    }
    for (const item of history) {
      const subject = plan.find((task) => task.topic === item.topic)?.subject ?? "General";
      const bucket = subjectMap.get(subject) ?? { subject, planned: 0, done: 0, hours: 0, questions: 0, correct: 0, quizzes: 0, revisions: 0, topics: new Set<string>(), remaining: new Set<string>() };
      bucket.quizzes += 1;
      bucket.questions += item.totalQuestions ?? 0;
      bucket.correct += Math.round(((item.accuracy ?? 0) / 100) * (item.totalQuestions ?? 0));
      subjectMap.set(subject, bucket);
    }

    const topicRows = plan.map((task) => {
      const topicAttempts = relevantAttempts.filter((attempt) => {
        const question = attempt.questionId as { topic?: string; subtopic?: string } | null;
        return [question?.topic, question?.subtopic].includes(task.topic);
      });
      const accuracy = topicAttempts.length > 0 ? percent(topicAttempts.filter((attempt) => attempt.isCorrect).length, topicAttempts.length) : isDone(task) ? 65 : 0;
      return {
        topic: task.topic ?? "General topic",
        subject: task.subject ?? "General",
        completion: isDone(task) ? 100 : 0,
        studyHours: round(task.durationHours ?? 0),
        questionsSolved: topicAttempts.length,
        accuracy,
        mistakesMade: topicAttempts.filter((attempt) => attempt.isCorrect === false).length,
        revisionCount: revisions.filter((revision) => dateOnly(revision.dueAt) >= today).length,
        difficultyLevel: accuracy >= 75 ? "easy" : accuracy >= 50 ? "medium" : "hard",
        masteryScore: Math.round((accuracy + (isDone(task) ? 100 : 0)) / 2),
        lastPracticed: topicAttempts[0] ? dateOnly(createdAtOf(topicAttempts[0])) : task.date ?? "",
        nextRevisionDate: revisions[0] ? dateOnly(revisions[0].dueAt) : "",
        estimatedRemainingHours: isDone(task) ? 0 : round(task.durationHours ?? 0)
      };
    });

    const subjectRows = [...subjectMap.values()].map((bucket) => {
      const accuracy = bucket.questions > 0 ? percent(bucket.correct, bucket.questions) : percent(bucket.done, bucket.planned);
      return {
        subject: bucket.subject,
        completion: percent(bucket.done, bucket.planned),
        studyHours: round(bucket.hours),
        accuracy,
        questionsSolved: bucket.questions,
        quizCount: bucket.quizzes,
        revisionCount: bucket.revisions,
        weaknessLevel: Math.max(0, 100 - accuracy),
        strengthLevel: accuracy,
        remainingTopics: bucket.remaining.size,
        estimatedCompletionDate: plan.filter((task) => task.subject === bucket.subject).at(-1)?.date ?? "",
        confidenceScore: Math.round((accuracy + percent(bucket.done, bucket.planned)) / 2)
      };
    });

    const dailySeries = Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - index));
      const key = dateOnly(date);
      const dayTasks = plan.filter((task) => task.date === key);
      const dayAttempts = relevantAttempts.filter((attempt) => dateOnly(createdAtOf(attempt)) === key);
      return {
        date: key.slice(5),
        studyHours: round(dayTasks.reduce((sum, task) => sum + (task.durationHours ?? 0), 0)),
        actualHours: round(dayTasks.filter(isDone).reduce((sum, task) => sum + (task.durationHours ?? 0), 0) + dayAttempts.reduce((sum, attempt) => sum + ((attempt.timeTakenSeconds ?? 0) / 3600), 0)),
        accuracy: dayAttempts.length > 0 ? percent(dayAttempts.filter((attempt) => attempt.isCorrect).length, dayAttempts.length) : 0,
        score: Math.round(average(completedHistory.filter((item) => item.date === key).map((item) => item.score ?? 0))),
        readiness: Math.min(100, Math.round((percent(completedTasks.length, plan.length) * 0.55) + (overallAccuracy * 0.45)))
      };
    });

    const readinessScore = Math.min(100, Math.round((percent(completedTasks.length, plan.length) * 0.5) + (overallAccuracy * 0.35) + Math.min(15, completedHistory.length + relevantSessions.filter((session) => session.status === "completed").length)));
    const weakSubjects = subjectRows.filter((row) => row.accuracy < 60 || row.completion < 40).slice(0, 4).map((row) => row.subject);
    const strongSubjects = subjectRows.filter((row) => row.accuracy >= 75 || row.completion >= 75).slice(0, 4).map((row) => row.subject);
    const weakTopics = topicRows.filter((row) => row.masteryScore < 60).slice(0, 5).map((row) => row.topic);
    const strongTopics = topicRows.filter((row) => row.masteryScore >= 75).slice(0, 5).map((row) => row.topic);

    const analytics = {
      user: {
        name: profile?.name ?? user?.email?.split("@")[0] ?? "Student",
        email: user?.email ?? "",
        role: user?.role ?? "student",
        avatarUrl: profile?.avatarUrl ?? "",
        avatarInitials: profile?.avatarInitials ?? "",
        lastLoginAt: user?.lastLoginAt,
        lastActivityAt: user?.lastActivityAt
      },
      exam: {
        activeExam: activeExamName ?? "No active exam",
        examsTracked: selectedExams.length,
        readinessScore,
        overallProgress: percent(completedTasks.length, plan.length),
        subjectsCompleted: subjectRows.filter((row) => row.completion === 100).length,
        topicsCompleted: completedTasks.length,
        pendingTopics: pendingTasks.length,
        totalPlannedHours: round(plannedHours),
        remainingHours: round(Math.max(0, plannedHours - completedHours)),
        mockTestsCompleted: completedHistory.filter((item) => /mock/i.test(item.topic ?? "")).length,
        expectedRank: readinessScore > 80 ? "Top 20%" : readinessScore > 55 ? "Top 40%" : "Needs more data",
        expectedScore: Math.round((readinessScore / 100) * 200),
        examCountdown: "Set exam date",
        priorityScore: Math.min(100, 50 + pendingTasks.length)
      },
      overview: {
        dailyStreak: streak.current,
        longestStreak: streak.longest,
        studyHoursToday: round(dailySeries.at(-1)?.actualHours ?? 0),
        studyHoursThisWeek: round(dailySeries.slice(-7).reduce((sum, day) => sum + day.actualHours, 0)),
        studyHoursThisMonth: round(plan.filter((task) => new Date(task.date ?? "").getTime() >= monthStart.getTime()).reduce((sum, task) => sum + (isDone(task) ? task.durationHours ?? 0 : 0), 0)),
        questionsSolved: totalQuestions,
        quizzesAttempted: completedHistory.length + relevantSessions.filter((session) => ["completed", "in_progress"].includes(session.status)).length,
        overallAccuracy,
        readinessScore,
        activeExam: activeExamName ?? "No active exam",
        examsTracked: selectedExams.length,
        completedTasks: completedTasks.length,
        pendingTasks: pendingTasks.length,
        upcomingQuiz: upcomingQuiz ? dateOnly(upcomingQuiz.scheduledAt) : history.find((item) => (item.date ?? "") >= today)?.date ?? "",
        upcomingStudyTask: upcomingTask?.topic ?? ""
      },
      study: {
        dailyStudyHours: state.dailyHours ?? 0,
        weeklyStudyHours: state.weeklyHours ?? 0,
        monthlyStudyHours: round((state.weeklyHours ?? 0) * 4.3),
        totalStudyHours: round(actualHours),
        plannedVsActualStudyHours: { planned: round(plannedHours), actual: round(actualHours) },
        numberOfStudySessions: completedTasks.length + relevantSessions.length,
        averageSessionDuration: round(average([...completedTasks.map((task) => task.durationHours ?? 0), ...quizDurations.map((value) => value / 60)])),
        longestSession: round(Math.max(0, ...completedTasks.map((task) => task.durationHours ?? 0), ...quizDurations.map((value) => value / 60))),
        shortestSession: round(Math.min(...[...completedTasks.map((task) => task.durationHours ?? 0), ...quizDurations.map((value) => value / 60)].filter((value) => value > 0), 0)),
        productiveStudyTime: round(actualHours * 0.86),
        breakTime: round(actualHours * 0.14),
        mostProductiveDay: dailySeries.reduce((best, day) => (day.actualHours > best.actualHours ? day : best), dailySeries[0] ?? { date: "", actualHours: 0 })?.date ?? "",
        mostProductiveTimeSlot: timeSlot(state.quizTime),
        missedStudyDays: Math.max(0, dailySeries.filter((day) => day.studyHours > 0 && day.actualHours === 0).length),
        revisionHours: round(revisions.length * 0.5),
        mockTestHours: round(completedHistory.filter((item) => /mock/i.test(item.topic ?? "")).length * 2)
      },
      planner: {
        totalPlannedTasks: plan.length,
        completedTasks: completedTasks.length,
        pendingTasks: pendingTasks.length,
        skippedTasks: plan.filter((task) => task.skipped).length,
        overdueTasks: overdueTasks.length,
        postponedTasks: plan.filter((task) => task.postponed).length,
        carryForwardTasks: plan.filter((task) => task.carryForward).length,
        completionPercentage: percent(completedTasks.length, plan.length),
        averageTaskCompletionTime: round(average(completedTasks.map((task) => task.durationHours ?? 0))),
        subjectWiseCompletion: subjectRows.map((row) => ({ label: row.subject, value: row.completion })),
        topicWiseCompletion: topicRows.slice(0, 12).map((row) => ({ label: row.topic, value: row.completion })),
        revisionProgress: revisions.length > 0 ? percent(revisions.filter((revision) => dateOnly(revision.dueAt) <= today).length, revisions.length) : 0,
        remainingStudyHours: round(Math.max(0, plannedHours - completedHours)),
        estimatedPlanCompletionDate: pendingTasks.at(-1)?.date ?? plan.at(-1)?.date ?? ""
      },
      quiz: {
        totalQuizzesAttempted: relevantSessions.length + history.length,
        completedQuizzes: relevantSessions.filter((session) => session.status === "completed").length + completedHistory.length,
        missedQuizzes: relevantSessions.filter((session) => session.status === "missed").length + history.filter((item) => (item.status ?? "").toLowerCase() === "missed").length,
        scheduledQuizzes: scheduled.filter((quiz) => !quiz.status || quiz.status === "scheduled").length,
        averageScore,
        highestScore: Math.max(0, ...scores),
        lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
        averageAccuracy: overallAccuracy,
        averageTimeTaken: round(average(timeValues)),
        fastestQuiz: round(Math.min(...quizDurations, 0)),
        slowestQuiz: round(Math.max(0, ...quizDurations)),
        totalQuestionsAttempted: relevantAttempts.length,
        correctAnswers,
        wrongAnswers,
        skippedQuestions,
        negativeMarks: round(negativeMarks, 2),
        positiveMarks: round(positiveMarks, 2),
        attemptRate: percent(relevantAttempts.length, relevantAttempts.length + skippedQuestions),
        questionAccuracy: overallAccuracy,
        difficultyWisePerformance: ["easy", "medium", "hard"].map((difficulty) => {
          const rows = relevantAttempts.filter((attempt) => ((attempt.questionId as { difficulty?: string } | null)?.difficulty ?? "") === difficulty);
          return { label: difficulty, value: rows.length > 0 ? percent(rows.filter((attempt) => attempt.isCorrect).length, rows.length) : 0 };
        }),
        sectionWisePerformance: subjectRows.map((row) => ({ label: row.subject, value: row.accuracy })),
        timePerQuestion: round(average(timeValues))
      },
      subjects: subjectRows,
      topics: topicRows.slice(0, 40),
      performance: {
        accuracyTrend: dailySeries.map((day) => ({ label: day.date, value: day.accuracy })),
        scoreTrend: dailySeries.map((day) => ({ label: day.date, value: day.score })),
        studyTrend: dailySeries.map((day) => ({ label: day.date, value: day.actualHours })),
        readinessTrend: dailySeries.map((day) => ({ label: day.date, value: day.readiness })),
        improvementTrend: dailySeries.map((day, index) => ({ label: day.date, value: Math.max(0, day.readiness - (dailySeries[index - 1]?.readiness ?? 0)) })),
        weeklyPerformance: Math.round(average(dailySeries.slice(-7).map((day) => day.readiness))),
        monthlyPerformance: readinessScore,
        rankPrediction: readinessScore > 80 ? "Strong" : readinessScore > 55 ? "Moderate" : "Build basics",
        expectedScore: Math.round((readinessScore / 100) * 200),
        expectedExamReadiness: readinessScore
      },
      goals: {
        dailyGoalProgress: percent(dailySeries.at(-1)?.actualHours ?? 0, state.dailyHours ?? 1),
        weeklyGoalProgress: percent(dailySeries.slice(-7).reduce((sum, day) => sum + day.actualHours, 0), state.weeklyHours ?? 1),
        monthlyGoalProgress: percent(actualHours, (state.weeklyHours ?? 1) * 4.3),
        studyHourGoal: state.dailyHours ?? 0,
        questionsGoal: 20,
        quizGoal: 1,
        revisionGoal: revisions.length,
        goalCompletionPercentage: percent(completedTasks.length, plan.length),
        missedGoals: dailySeries.filter((day) => day.studyHours > 0 && day.actualHours < day.studyHours).length
      },
      streaks: {
        currentStreak: streak.current,
        longestStreak: streak.longest,
        weeklyConsistency: percent(dailySeries.slice(-7).filter((day) => day.actualHours > 0 || day.studyHours > 0).length, 7),
        monthlyConsistency: percent(dailySeries.filter((day) => day.actualHours > 0 || day.studyHours > 0).length, dailySeries.length),
        missedStreaks: dailySeries.filter((day) => day.studyHours > 0 && day.actualHours === 0).length,
        recoveryStreak: streak.current > 0 ? streak.current : 0,
        attendancePercentage: percent(studyDates.length, Math.max(1, plan.length)),
        studyConsistencyScore: percent(dailySeries.filter((day) => day.actualHours >= Math.min(day.studyHours, state.dailyHours ?? 0)).length, dailySeries.length)
      },
      aiInsights: {
        weakSubjects,
        weakTopics,
        strongSubjects,
        strongTopics,
        recommendedTopicsToStudy: weakTopics.length > 0 ? weakTopics : pendingTasks.slice(0, 3).map((task) => task.topic ?? "Next planned topic"),
        recommendedRevisionSchedule: revisions.slice(0, 5).map((revision) => dateOnly(revision.dueAt)),
        suggestedStudyHours: Math.max(state.dailyHours ?? 0, overdueTasks.length > 0 ? (state.dailyHours ?? 0) + 0.5 : state.dailyHours ?? 0),
        suggestedQuiz: upcomingTask?.topic ?? "Complete your next planned topic first",
        burnoutRisk: (state.dailyHours ?? 0) > 5 || overdueTasks.length > 5 ? "High" : (state.dailyHours ?? 0) > 3 ? "Medium" : "Low",
        learningSpeed: completedTasks.length > 0 ? `${round(completedHours / Math.max(1, completedTasks.length))}h/task` : "Not enough data",
        consistencyScore: percent(dailySeries.filter((day) => day.actualHours > 0 || day.studyHours > 0).length, dailySeries.length),
        successProbability: readinessScore,
        personalizedDailySuggestions: [
          upcomingTask ? `Focus on ${upcomingTask.topic}.` : "Create a study plan to unlock daily guidance.",
          weakTopics[0] ? `Revise ${weakTopics[0]} before your next quiz.` : "Keep taking quizzes to reveal weak topics.",
          overdueTasks.length > 0 ? `Carry forward ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}.` : "Your plan is on track."
        ]
      },
      calendar: {
        studyCalendar: dailySeries.map((day) => ({ date: day.date, value: day.actualHours })),
        quizCalendar: history.slice(0, 30).map((item) => ({ date: item.date, value: item.status })),
        revisionCalendar: revisions.slice(0, 30).map((revision) => ({ date: dateOnly(revision.dueAt), value: "Revision" })),
        completedDays: [...new Set([...studyDates, ...quizDates])].length,
        missedDays: dailySeries.filter((day) => day.studyHours > 0 && day.actualHours === 0).length,
        upcomingTasks: pendingTasks.slice(0, 5),
        upcomingQuizzes: scheduled.slice(0, 5)
      },
      achievements: {
        badgesEarned: achievements.filter((achievement) => {
          const key = String(achievement.key);
          return (key.includes("questions") && totalQuestions >= 100) || (key.includes("streak") && streak.current >= 7) || readinessScore >= 80;
        }).map((achievement) => achievement.title),
        milestonesCompleted: [
          totalQuestions >= 100 ? "100 questions" : "",
          totalQuestions >= 500 ? "500 questions" : "",
          totalQuestions >= 1000 ? "1000 questions" : "",
          streak.current >= 7 ? "Study streak" : "",
          overallAccuracy === 100 && relevantAttempts.length > 0 ? "Perfect score" : ""
        ].filter(Boolean),
        questionsBadge100: totalQuestions >= 100,
        questionsBadge500: totalQuestions >= 500,
        questionsBadge1000: totalQuestions >= 1000,
        studyStreakBadges: streak.current >= 7,
        subjectMasterBadge: subjectRows.some((row) => row.completion === 100 && row.accuracy >= 75),
        quizChampionBadge: scores.some((score) => score >= 90),
        revisionMasterBadge: revisions.length >= 10,
        perfectScoreBadge: overallAccuracy === 100 && relevantAttempts.length > 0
      },
      charts: {
        studyHoursTrend: dailySeries.map((day) => ({ label: day.date, value: day.actualHours })),
        accuracyTrend: dailySeries.map((day) => ({ label: day.date, value: day.accuracy })),
        quizScoreTrend: dailySeries.map((day) => ({ label: day.date, value: day.score })),
        readinessTrend: dailySeries.map((day) => ({ label: day.date, value: day.readiness })),
        subjectWiseProgress: subjectRows.map((row) => ({ label: row.subject, value: row.completion })),
        topicWiseProgress: topicRows.slice(0, 10).map((row) => ({ label: row.topic, value: row.completion })),
        weeklyHeatmap: dailySeries.slice(-7).map((day) => ({ label: day.date, value: day.actualHours })),
        monthlyHeatmap: dailySeries.map((day) => ({ label: day.date, value: day.actualHours })),
        plannedVsActualStudyHours: dailySeries.map((day) => ({ label: day.date, planned: day.studyHours, actual: day.actualHours })),
        quizCompletionTrend: dailySeries.map((day) => ({ label: day.date, value: history.filter((item) => (item.date ?? "").slice(5) === day.date).length })),
        goalCompletionTrend: dailySeries.map((day) => ({ label: day.date, value: percent(day.actualHours, Math.max(1, day.studyHours)) })),
        streakTimeline: dailySeries.map((day) => ({ label: day.date, value: day.actualHours > 0 ? 1 : 0 })),
        revisionTrend: dailySeries.map((day) => ({ label: day.date, value: revisions.filter((revision) => dateOnly(revision.dueAt).slice(5) === day.date).length })),
        mockTestPerformance: completedHistory.filter((item) => /mock/i.test(item.topic ?? "")).map((item) => ({ label: item.date ?? "", value: item.accuracy ?? 0 })),
        subjectDistribution: subjectRows.map((row) => ({ label: row.subject, value: row.studyHours })),
        timeDistribution: subjectRows.map((row) => ({ label: row.subject, value: row.studyHours }))
      },
      smartInsights: [
        `You study best in the ${timeSlot(state.quizTime).toLowerCase()} slot.`,
        weakSubjects[0] ? `${weakSubjects[0]} needs the most attention right now.` : "No major weak subject detected yet.",
        strongSubjects[0] ? `${strongSubjects[0]} is your strongest subject.` : "Complete a few quizzes to identify your strongest subject.",
        revisions.length > 0 ? `You have ${revisions.length} revision item${revisions.length === 1 ? "" : "s"} queued.` : "Add revision quizzes to improve retention.",
        `You are ${readinessScore}% ready for ${activeExamName ?? "your active exam"}.`,
        pendingTasks.length > 0 ? `Complete ${Math.min(3, pendingTasks.length)} more topic${Math.min(3, pendingTasks.length) === 1 ? "" : "s"} to lift readiness.` : "All planned topics are complete.",
        streak.current > 0 ? `Maintain your streak for ${Math.max(1, 7 - streak.current)} more day${Math.max(1, 7 - streak.current) === 1 ? "" : "s"} to unlock the next streak badge.` : "Start today to begin your streak."
      ]
    };

    res.status(200).json({ data: analytics, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};

export const recordPlatformUsage: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized();
    const durationSeconds = Math.max(0, Math.min(Number(req.body.durationSeconds ?? 0), 6 * 60 * 60));
    if (durationSeconds < 1) {
      res.status(200).json({ data: { recorded: false }, requestId: req.requestId });
      return;
    }

    await AnalyticsModel.create({
      userId: req.user.id,
      metrics: {
        type: "platform_usage",
        durationSeconds: Math.round(durationSeconds),
        path: typeof req.body.path === "string" ? req.body.path.slice(0, 160) : "",
        activeExamId: typeof req.body.activeExamId === "string" ? req.body.activeExamId.slice(0, 160) : "",
        recordedAt: new Date()
      }
    });

    res.status(201).json({ data: { recorded: true }, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};
