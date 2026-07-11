import type { RequestHandler } from "express";
import { AnalyticsModel, AuthActivityModel, OnboardingStateModel, ProfileModel, UserModel } from "../models/core.model.js";

const examKey = (exam: { id?: string; examName: string }) => exam.id ?? exam.examName.trim().toLowerCase();

const dateKey = (value?: Date | string) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const round = (value: number, decimals = 1) => Number(value.toFixed(decimals));
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

interface LeanOnboardingState {
  userId?: unknown;
  sessionId?: string | null;
  state?: Record<string, unknown>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface LeanAuthActivity {
  _id: unknown;
  userId?: unknown;
  email?: string | null;
  event?: string;
  provider?: string | null;
  createdAt?: Date | string;
}

interface LeanUsageRecord {
  userId?: unknown;
  metrics?: {
    type?: string;
    durationSeconds?: number;
    path?: string;
    activeExamId?: string;
    recordedAt?: Date | string;
  };
  createdAt?: Date | string;
}

const displayName = (email?: string | null, name?: string | null) => {
  if (name?.trim()) return name.trim();
  const local = email?.split("@")[0] ?? "Unknown user";
  return local
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ") || local;
};

const summarizeState = (record: LeanOnboardingState) => {
  const state = record.state ?? {};
  const exams = Array.isArray(state["discoveredExams"]) ? (state["discoveredExams"] as Array<{ id?: string; examName: string }>) : [];
  const activeExamId = typeof state["activeExamId"] === "string" ? state["activeExamId"] : exams[0] ? examKey(exams[0]) : "";
  const activeExam = exams.find((exam) => examKey(exam) === activeExamId) ?? exams[0];
  const plan = Array.isArray(state["plan"]) ? (state["plan"] as Array<{ date?: string; examName?: string; subject?: string; topic?: string; durationHours?: number; done?: boolean }>) : [];
  const quizHistory = Array.isArray(state["quizHistory"]) ? (state["quizHistory"] as Array<{ date?: string; examName?: string; topic?: string; status?: string; accuracy?: number; score?: number; totalQuestions?: number }>) : [];

  return {
    userId: record.userId ? String(record.userId) : undefined,
    sessionId: record.sessionId,
    activeExamName: activeExam?.examName ?? "No exam",
    selectedExamNames: exams.map((exam) => exam.examName),
    dailyHours: Number(state["dailyHours"] ?? 0),
    weeklyHours: Number(state["weeklyHours"] ?? 0),
    quizTime: typeof state["quizTime"] === "string" ? state["quizTime"] : "",
    planCount: plan.length,
    completedPlanCount: plan.filter((task) => task.done).length,
    quizCount: quizHistory.length,
    completedQuizCount: quizHistory.filter((quiz) => quiz.status === "Completed").length,
    plan,
    quizHistory,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
};

export const getAdminAnalytics: RequestHandler = async (_req, res, next) => {
  try {
    const [users, profiles, states, activities, usageRecords] = await Promise.all([
      UserModel.find().select("_id email role lastLoginAt lastActivityAt createdAt").sort({ createdAt: -1 }).limit(1000).lean(),
      ProfileModel.find().select("userId name").limit(1000).lean(),
      OnboardingStateModel.find().sort({ updatedAt: -1 }).limit(200).lean(),
      AuthActivityModel.find().sort({ createdAt: -1 }).limit(1000).lean(),
      AnalyticsModel.find({ "metrics.type": "platform_usage" }).sort({ createdAt: -1 }).limit(10000).lean()
    ]);
    const summarizedStates = (states as LeanOnboardingState[]).map(summarizeState);
    const authenticatedStates = summarizedStates.filter((state) => state.userId);
    const registeredUserIds = new Set(users.map((user) => String(user._id)));
    const active7Cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const active30Cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const examMap = new Map<string, { exam: string; users: Set<string>; plans: number; completedPlans: number; quizzes: number; completedQuizzes: number; accuracyValues: number[]; plannedHours: number }>();
    const subjectMap = new Map<string, { subject: string; tasks: number; hours: number; completed: number }>();
    const dayMap = new Map<string, { label: string; logins: number; signups: number; plannedHours: number; completedTasks: number; quizzes: number; accuracyValues: number[] }>();
    const providerMap = new Map<string, number>();
    const roleMap = new Map<string, number>();
    const usageByUser = new Map<string, number>();
    const profileNameByUserId = new Map(profiles.map((profile) => [String(profile.userId), profile.name as string]));
    const userNameById = new Map(users.map((user) => [String(user._id), displayName(user.email, profileNameByUserId.get(String(user._id)))]));
    const userNameByEmail = new Map(users.map((user) => [user.email, displayName(user.email, profileNameByUserId.get(String(user._id)))]));
    const userJoinDateMap = new Map<string, Set<string>>();
    const loginMatrixMap = new Map<string, Map<string, number>>();
    const examUserMap = new Map<string, Set<string>>();
    const usageMatrixMap = new Map<string, Map<string, number>>();
    const quizMatrixMap = new Map<string, Map<string, number>>();

    const ensureDay = (label: string) => {
      const day = dayMap.get(label) ?? { label, logins: 0, signups: 0, plannedHours: 0, completedTasks: 0, quizzes: 0, accuracyValues: [] };
      dayMap.set(label, day);
      return day;
    };

    for (const user of users) {
      roleMap.set(String(user.role ?? "student"), (roleMap.get(String(user.role ?? "student")) ?? 0) + 1);
      const day = dateKey((user as { createdAt?: Date | string }).createdAt);
      const name = userNameById.get(String(user._id)) ?? displayName(user.email);
      const names = userJoinDateMap.get(day) ?? new Set<string>();
      names.add(name);
      userJoinDateMap.set(day, names);
    }

    for (const activity of activities as LeanAuthActivity[]) {
      const day = ensureDay(dateKey(activity.createdAt));
      if (activity.event === "login" || activity.event === "google_login" || activity.event === "return_login" || activity.event === "email_verified") {
        day.logins += 1;
        const userId = activity.userId ? String(activity.userId) : "";
        const name = userId ? userNameById.get(userId) : userNameByEmail.get(activity.email ?? "");
        if (name) {
          const row = loginMatrixMap.get(name) ?? new Map<string, number>();
          const key = dateKey(activity.createdAt);
          row.set(key, (row.get(key) ?? 0) + 1);
          loginMatrixMap.set(name, row);
        }
      }
      if (activity.event === "register_started" || activity.event === "google_login") day.signups += 1;
      providerMap.set(activity.provider ?? "email", (providerMap.get(activity.provider ?? "email") ?? 0) + 1);
    }

    for (const record of usageRecords as LeanUsageRecord[]) {
      const seconds = Math.max(0, Number(record.metrics?.durationSeconds ?? 0));
      const userId = record.userId ? String(record.userId) : "";
      if (userId) usageByUser.set(userId, (usageByUser.get(userId) ?? 0) + seconds);
      const day = ensureDay(dateKey(record.metrics?.recordedAt ?? record.createdAt));
      day.plannedHours += seconds / 3600;
      const userName = userId ? userNameById.get(userId) : undefined;
      if (userName) {
        const row = usageMatrixMap.get(userName) ?? new Map<string, number>();
        const key = dateKey(record.metrics?.recordedAt ?? record.createdAt);
        row.set(key, (row.get(key) ?? 0) + seconds);
        usageMatrixMap.set(userName, row);
      }
    }

    for (const state of summarizedStates) {
      const userKey = state.userId ?? state.sessionId ?? "anonymous";
      const userName = state.userId ? userNameById.get(state.userId) ?? "Unknown user" : "Anonymous user";
      for (const examName of state.selectedExamNames.length > 0 ? state.selectedExamNames : ["No exam"]) {
        const bucket = examMap.get(examName) ?? { exam: examName, users: new Set<string>(), plans: 0, completedPlans: 0, quizzes: 0, completedQuizzes: 0, accuracyValues: [], plannedHours: 0 };
        bucket.users.add(userKey);
        examMap.set(examName, bucket);
        if (examName !== "No exam") {
          const names = examUserMap.get(examName) ?? new Set<string>();
          names.add(userName);
          examUserMap.set(examName, names);
        }
      }

      for (const task of state.plan) {
        const examName = task.examName ?? "No exam";
        const examBucket = examMap.get(examName) ?? { exam: examName, users: new Set<string>(), plans: 0, completedPlans: 0, quizzes: 0, completedQuizzes: 0, accuracyValues: [], plannedHours: 0 };
        examBucket.users.add(userKey);
        examBucket.plans += 1;
        examBucket.completedPlans += task.done ? 1 : 0;
        examBucket.plannedHours += task.durationHours ?? 0;
        examMap.set(examName, examBucket);

        const subject = task.subject ?? "General";
        const subjectBucket = subjectMap.get(subject) ?? { subject, tasks: 0, hours: 0, completed: 0 };
        subjectBucket.tasks += 1;
        subjectBucket.hours += task.durationHours ?? 0;
        subjectBucket.completed += task.done ? 1 : 0;
        subjectMap.set(subject, subjectBucket);

        const day = ensureDay(task.date ?? dateKey(state.updatedAt));
        day.completedTasks += task.done ? 1 : 0;
      }

      for (const quiz of state.quizHistory) {
        const examName = quiz.examName ?? "No exam";
        const examBucket = examMap.get(examName) ?? { exam: examName, users: new Set<string>(), plans: 0, completedPlans: 0, quizzes: 0, completedQuizzes: 0, accuracyValues: [], plannedHours: 0 };
        examBucket.users.add(userKey);
        examBucket.quizzes += 1;
        examBucket.completedQuizzes += quiz.status === "Completed" ? 1 : 0;
        if (typeof quiz.accuracy === "number") examBucket.accuracyValues.push(quiz.accuracy);
        examMap.set(examName, examBucket);
        const row = quizMatrixMap.get(examName) ?? new Map<string, number>();
        row.set(userName, (row.get(userName) ?? 0) + 1);
        quizMatrixMap.set(examName, row);

        const day = ensureDay(quiz.date ?? dateKey(state.updatedAt));
        day.quizzes += 1;
        if (typeof quiz.accuracy === "number") day.accuracyValues.push(quiz.accuracy);
      }
    }

    const examRows = [...examMap.values()]
      .map((row) => ({
        exam: row.exam,
        users: row.users.size,
        plans: row.plans,
        completedPlans: row.completedPlans,
        quizzes: row.quizzes,
        completedQuizzes: row.completedQuizzes,
        plannedHours: round(row.plannedHours),
        averageAccuracy: Math.round(average(row.accuracyValues)),
        completionRate: percent(row.completedPlans, row.plans)
      }))
      .sort((a, b) => b.users - a.users);

    const timeline = [...dayMap.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-60)
      .map((day) => ({
        label: day.label,
        logins: day.logins,
        signups: day.signups,
        plannedHours: round(day.plannedHours),
        completedTasks: day.completedTasks,
        quizzes: day.quizzes,
        accuracy: Math.round(average(day.accuracyValues))
      }));

    const totalPlans = summarizedStates.reduce((sum, state) => sum + state.planCount, 0);
    const completedPlans = summarizedStates.reduce((sum, state) => sum + state.completedPlanCount, 0);
    const totalQuizzes = summarizedStates.reduce((sum, state) => sum + state.quizCount, 0);
    const completedQuizzes = summarizedStates.reduce((sum, state) => sum + state.completedQuizCount, 0);
    const totalUsageSeconds = [...usageByUser.values()].reduce((sum, value) => sum + value, 0);
    const totalRegisteredExams = summarizedStates.reduce((sum, state) => sum + new Set(state.selectedExamNames).size, 0);
    const quizUserCount = new Set(summarizedStates.filter((state) => state.quizHistory.length > 0).map((state) => state.userId ?? state.sessionId).filter(Boolean)).size;
    const accuracyValues = summarizedStates.flatMap((state) =>
      state.quizHistory.flatMap((quiz) => typeof quiz.accuracy === "number" ? [quiz.accuracy] : [])
    );
    const averageAccuracy = Math.round(average(accuracyValues));
    const activeUsers7d = users.filter((user) => user.lastActivityAt && new Date(user.lastActivityAt).getTime() >= active7Cutoff).length;
    const activeUsers30d = users.filter((user) => user.lastActivityAt && new Date(user.lastActivityAt).getTime() >= active30Cutoff).length;
    const topExam = examRows[0];
    const weakExam = [...examRows].filter((row) => row.quizzes > 0).sort((a, b) => a.averageAccuracy - b.averageAccuracy)[0];
    const engagementRate = percent(authenticatedStates.length, users.length);
    const planAdoptionRate = percent(summarizedStates.filter((state) => state.planCount > 0).length, summarizedStates.length);
    const quizCompletionRate = percent(completedQuizzes, totalQuizzes);

    const insights = [
      topExam ? `${topExam.exam} is the highest-demand exam with ${topExam.users} tracked user${topExam.users === 1 ? "" : "s"}.` : "No exam demand data yet.",
      `${activeUsers7d} user${activeUsers7d === 1 ? "" : "s"} were active in the last 7 days.`,
      `Users have spent ${Math.floor(totalUsageSeconds / 3600)}h ${Math.floor((totalUsageSeconds % 3600) / 60)}m actively on the platform.`,
      totalQuizzes > 0 ? `Quiz completion rate is ${quizCompletionRate}% across ${totalQuizzes} scheduled/started quiz record${totalQuizzes === 1 ? "" : "s"}.` : "No quiz attempts recorded yet.",
      weakExam ? `${weakExam.exam} has the lowest quiz accuracy at ${weakExam.averageAccuracy}%, worth reviewing for content difficulty.` : "Not enough quiz accuracy data to detect a weak exam.",
      engagementRate < 60 ? "Many accounts have not started a plan yet. Onboarding nudges should be prioritized." : "Most registered users have saved preparation data."
    ];

    res.json({
      data: {
        summary: {
          userCount: users.length,
          activeUsers7d,
          activeUsers30d,
          trackedExamCount: examRows.filter((row) => row.exam !== "No exam").length,
          totalRegisteredExams,
          planTasks: totalPlans,
          completedPlanTasks: completedPlans,
          planCompletionRate: percent(completedPlans, totalPlans),
          studySeconds: totalUsageSeconds,
          quizRecords: totalQuizzes,
          quizUserCount,
          completedQuizzes,
          quizCompletionRate,
          averageAccuracy,
          planAdoptionRate,
          engagementRate
        },
        users: users.map((user) => ({
        id: String(user._id),
        email: user.email,
        name: userNameById.get(String(user._id)) ?? displayName(user.email),
        role: user.role,
        lastLoginAt: user.lastLoginAt,
        lastActivityAt: user.lastActivityAt,
          createdAt: (user as { createdAt?: Date | string }).createdAt
        })),
        models: {
          usersByDate: [...userJoinDateMap.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, names]) => ({ date, count: names.size, users: [...names].sort() })),
          loginCounts: [...loginMatrixMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, counts]) => ({ user: name, counts: Object.fromEntries([...counts.entries()].sort(([a], [b]) => b.localeCompare(a))) })),
          registeredExams: [...examUserMap.entries()]
            .sort((a, b) => b[1].size - a[1].size)
            .map(([exam, names]) => ({ exam, userCount: names.size, users: [...names].sort() })),
          activeStudyTime: [...usageMatrixMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, secondsByDate]) => ({ user: name, secondsByDate: Object.fromEntries([...secondsByDate.entries()].sort(([a], [b]) => b.localeCompare(a))) })),
          quizzes: [...quizMatrixMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([exam, userCounts]) => ({ exam, userCounts: Object.fromEntries([...userCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) }))
        },
        roleDistribution: [...roleMap.entries()].map(([label, value]) => ({ label, value })),
        providerDistribution: [...providerMap.entries()].map(([label, value]) => ({ label, value })),
        examRows,
        subjectRows: [...subjectMap.values()]
          .map((row) => ({ ...row, hours: round(row.hours), completionRate: percent(row.completed, row.tasks) }))
          .sort((a, b) => b.tasks - a.tasks)
          .slice(0, 12),
        timeline,
        insights,
        states: summarizedStates,
        authEvents: (activities as LeanAuthActivity[]).map((activity) => ({
          id: String(activity._id),
          userId: activity.userId ? String(activity.userId) : undefined,
          email: activity.email,
          event: activity.event,
          provider: activity.provider,
          createdAt: activity.createdAt
        }))
      },
      requestId: res.req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const makeUsersAdmin: RequestHandler = async (req, res, next) => {
  try {
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds.filter((id: unknown): id is string => typeof id === "string") : [];
    if (userIds.length === 0) {
      res.status(400).json({ message: "Select at least one user.", requestId: req.requestId });
      return;
    }

    await UserModel.updateMany({ _id: { $in: userIds }, role: { $ne: "super_admin" } }, { $set: { role: "admin" } });
    res.status(200).json({ data: { updated: userIds.length }, requestId: req.requestId });
  } catch (error) {
    next(error);
  }
};
