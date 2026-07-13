import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Award,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Flame,
  Gauge,
  LogOut,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp
} from "lucide-react";
import { APP_STATE_UPDATED_EVENT, apiClient } from "../../api/client";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { useAuthStore } from "../../store/auth-store";
import { formatDisplayDate } from "../../utils/format";

type TrendPoint = { label: string; value: number; planned?: number; actual?: number };
type LabelValue = { label: string; value: number };

interface SubjectRow {
  subject: string;
  completion: number;
  studyHours: number;
  accuracy: number;
  questionsSolved: number;
  quizCount: number;
  revisionCount: number;
  weaknessLevel: number;
  strengthLevel: number;
  remainingTopics: number;
  estimatedCompletionDate: string;
  confidenceScore: number;
}

interface TopicRow {
  topic: string;
  subject: string;
  completion: number;
  studyHours: number;
  questionsSolved: number;
  accuracy: number;
  mistakesMade: number;
  revisionCount: number;
  difficultyLevel: string;
  masteryScore: number;
  lastPracticed: string;
  nextRevisionDate: string;
  estimatedRemainingHours: number;
}

interface ProfileAnalytics {
  user: { name?: string; email: string; role: string; avatarUrl?: string; avatarInitials?: string };
  exam: {
    readinessScore: number;
    overallProgress: number;
    topicsCompleted: number;
    pendingTopics: number;
    totalPlannedHours: number;
    remainingHours: number;
    expectedRank: string;
    expectedScore: number;
    priorityScore: number;
  };
  overview: {
    dailyStreak: number;
    longestStreak: number;
    studyHoursToday: number;
    studyHoursThisWeek: number;
    studyHoursThisMonth: number;
    questionsSolved: number;
    quizzesAttempted: number;
    overallAccuracy: number;
    readinessScore: number;
    activeExam: string;
    examsTracked: number;
    completedTasks: number;
    pendingTasks: number;
    upcomingQuiz: string;
    upcomingStudyTask: string;
  };
  study: {
    dailyStudyHours: number;
    weeklyStudyHours: number;
    totalStudyHours: number;
    productiveStudyTime: number;
    breakTime: number;
    mostProductiveTimeSlot: string;
    missedStudyDays: number;
    revisionHours: number;
  };
  planner: {
    totalPlannedTasks: number;
    completedTasks: number;
    pendingTasks: number;
    overdueTasks: number;
    carryForwardTasks: number;
    completionPercentage: number;
    remainingStudyHours: number;
    estimatedPlanCompletionDate: string;
  };
  quiz: {
    totalQuizzesAttempted: number;
    completedQuizzes: number;
    missedQuizzes: number;
    scheduledQuizzes: number;
    averageScore: number;
    highestScore: number;
    averageAccuracy: number;
    correctAnswers: number;
    wrongAnswers: number;
    skippedQuestions: number;
    timePerQuestion: number;
    difficultyWisePerformance: LabelValue[];
    sectionWisePerformance: LabelValue[];
  };
  goals: {
    dailyGoalProgress: number;
    weeklyGoalProgress: number;
    monthlyGoalProgress: number;
    goalCompletionPercentage: number;
    missedGoals: number;
  };
  streaks: {
    weeklyConsistency: number;
    monthlyConsistency: number;
    attendancePercentage: number;
    studyConsistencyScore: number;
  };
  aiInsights: {
    weakSubjects: string[];
    weakTopics: string[];
    strongSubjects: string[];
    strongTopics: string[];
    recommendedTopicsToStudy: string[];
    suggestedStudyHours: number;
    suggestedQuiz: string;
    burnoutRisk: string;
    consistencyScore: number;
    successProbability: number;
    personalizedDailySuggestions: string[];
  };
  calendar: {
    completedDays: number;
    missedDays: number;
    upcomingTasks: Array<{ date?: string; topic?: string; subject?: string; durationHours?: number }>;
  };
  achievements: {
    badgesEarned: string[];
    milestonesCompleted: string[];
    questionsBadge100: boolean;
    questionsBadge500: boolean;
    questionsBadge1000: boolean;
    studyStreakBadges: boolean;
    subjectMasterBadge: boolean;
    quizChampionBadge: boolean;
    revisionMasterBadge: boolean;
    perfectScoreBadge: boolean;
  };
  subjects: SubjectRow[];
  topics: TopicRow[];
  charts: {
    studyHoursTrend: TrendPoint[];
    accuracyTrend: TrendPoint[];
    readinessTrend: TrendPoint[];
    subjectWiseProgress: LabelValue[];
    topicWiseProgress: LabelValue[];
    monthlyHeatmap: LabelValue[];
    plannedVsActualStudyHours: TrendPoint[];
    quizScoreTrend: TrendPoint[];
    goalCompletionTrend: TrendPoint[];
    subjectDistribution: LabelValue[];
  };
  smartInsights: string[];
}

interface LayoutState {
  discoveredExams?: Array<{ id?: string; examName: string }>;
  selectedExamIds?: string[];
  activeExamId?: string;
  plan?: Array<{ examName?: string }>;
  quizHistory?: Array<{ examName?: string }>;
}

const palette = ["#0f766e", "#2563eb", "#f97316", "#7c3aed", "#e11d48", "#0891b2", "#65a30d"];
const emptyTrend: TrendPoint[] = [{ label: "No data", value: 0 }];
const examKey = (exam: { id?: string; examName: string }) => exam.id ?? exam.examName.trim().toLowerCase();

export const ProfilePage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [analytics, setAnalytics] = useState<ProfileAnalytics | null>(null);
  const [layoutState, setLayoutState] = useState<LayoutState>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [profileResponse, stateResponse] = await Promise.all([
          apiClient.get<{ data: ProfileAnalytics }>("/profile/analytics"),
          apiClient.get<{ data: LayoutState }>("/onboarding/state")
        ]);
        if (mounted) {
          setAnalytics(profileResponse.data.data);
          setLayoutState(stateResponse.data.data ?? {});
          setError("");
        }
      } catch {
        if (mounted) setError("Profile analytics could not be loaded. Please refresh after signing in.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const logout = async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      clearSession();
      await navigate({ to: "/login" });
    }
  };

  const deleteExam = async (exam: { id?: string; examName: string }) => {
    const key = examKey(exam);
    const remainingExams = (layoutState.discoveredExams ?? []).filter((item) => examKey(item) !== key);
    const nextState: LayoutState = {
      ...layoutState,
      discoveredExams: remainingExams,
      selectedExamIds: (layoutState.selectedExamIds ?? []).filter((item) => item !== key),
      activeExamId: layoutState.activeExamId === key ? remainingExams[0] ? examKey(remainingExams[0]) : undefined : layoutState.activeExamId,
      plan: (layoutState.plan ?? []).filter((task) => task.examName !== exam.examName),
      quizHistory: (layoutState.quizHistory ?? []).filter((item) => item.examName !== exam.examName)
    };
    await apiClient.put("/onboarding/state", { state: nextState });
    setLayoutState(nextState);
    window.dispatchEvent(new Event(APP_STATE_UPDATED_EVENT));
  };

  const subjectHealth = useMemo(() => analytics?.subjects.slice(0, 8) ?? [], [analytics]);
  const weakTopics = useMemo(
    () => (analytics?.topics ?? []).slice().sort((a, b) => a.masteryScore - b.masteryScore).slice(0, 6),
    [analytics]
  );
  const scorecard = useMemo(() => {
    if (!analytics) return [];
    return [
      { label: "Study week", value: `${analytics.overview.studyHoursThisWeek}h`, detail: `${analytics.study.weeklyStudyHours}h goal`, icon: Clock3, tone: "text-emerald-600" },
      { label: "Accuracy", value: `${analytics.overview.overallAccuracy}%`, detail: `${analytics.quiz.correctAnswers} correct`, icon: Target, tone: "text-violet-600" },
      { label: "Streak", value: `${analytics.overview.dailyStreak}d`, detail: `best ${analytics.overview.longestStreak}d`, icon: Flame, tone: "text-orange-600" },
      { label: "Questions", value: String(analytics.overview.questionsSolved), detail: `${analytics.quiz.completedQuizzes} quizzes`, icon: Brain, tone: "text-brand" }
    ];
  }, [analytics]);

  if (isLoading) {
    return <Card className="p-4"><p className="text-sm font-bold text-slate-500">Loading smart dashboard...</p></Card>;
  }

  if (!analytics) {
    return <Card className="p-4"><p className="text-sm font-bold text-rose-600">{error || "Smart dashboard is unavailable."}</p></Card>;
  }

  const primaryInsight = analytics.aiInsights.personalizedDailySuggestions[0] ?? analytics.smartInsights[0] ?? "Create a plan to unlock personalized guidance.";
  const avatarInitials = analytics.user.avatarInitials || (analytics.user.name || analytics.user.email || "Student").split(/[._\-\s@]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SR";

  return (
    <div className="space-y-3 pb-28">
      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink text-sm font-black text-white sm:size-10">
              {analytics.user.avatarUrl ? <img src={analytics.user.avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : avatarInitials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-brand">Smart Profile</p>
            <h1 className="truncate text-lg font-black sm:text-xl">SK Quiz Coach Account</h1>
              <p className="truncate text-sm text-slate-500">{analytics.user.name || analytics.user.email} / {analytics.overview.activeExam}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <ProfilePill label="Role" value={analytics.user.role || user?.role || "student"} />
            <ProfilePill label="Tracked" value={String(analytics.overview.examsTracked)} />
            <ProfilePill label="Daily" value={`${analytics.study.dailyStudyHours}h`} />
            <ProfilePill label="Ready" value={`${analytics.overview.readinessScore}%`} />
            <Button variant="secondary" className="col-span-2 min-h-9 px-3 sm:col-span-1" onClick={() => setSettingsOpen(true)}>
              <Settings className="size-4" aria-hidden />
              Settings
            </Button>
          </div>
        </div>
      </Card>
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 py-8 backdrop-blur-sm"
          onMouseDown={() => setSettingsOpen(false)}
          role="presentation"
        >
          <Card className="w-full max-w-2xl p-4" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Account settings</p>
                <h2 className="text-xl font-black">{analytics.user.name || "SK Quiz Coach Account"}</h2>
                <p className="text-sm font-semibold text-slate-500">{analytics.user.email}</p>
              </div>
              <Button variant="secondary" onClick={() => void logout()}>
                <LogOut className="size-4" aria-hidden />
                Logout
              </Button>
            </div>
            <div className="mt-4 rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Exam deletion</p>
                  <p className="text-xs font-semibold text-slate-500">Remove saved plan, quiz history, and selected data for an exam.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {(layoutState.discoveredExams ?? []).length === 0 ? (
                  <p className="rounded-md bg-slate-50 p-3 text-sm font-semibold text-slate-500">No saved exams yet.</p>
                ) : (
                  (layoutState.discoveredExams ?? []).map((exam) => (
                    <div key={examKey(exam)} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                      <span className="min-w-0 truncate text-sm font-bold">{exam.examName}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0 text-rose-700 hover:bg-rose-50"
                        onClick={() => void deleteExam(exam)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setSettingsOpen(false)}>Close</Button>
            </div>
          </Card>
        </div>
      )}

      <section className="grid gap-3 xl:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="bg-ink p-3 text-white sm:p-4">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-200">Readiness</p>
            <div className="relative mt-2 h-36 sm:h-48 xl:h-44">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="96%" data={[{ name: "Readiness", value: analytics.overview.readinessScore, fill: "#67e8f9" }]} startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" background cornerRadius={16} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-4xl font-black leading-none sm:text-5xl">{analytics.overview.readinessScore}%</p>
                <p className="mt-1 max-w-[108px] px-1 text-center text-[10px] font-black leading-tight text-cyan-100 sm:max-w-[128px] sm:text-[11px]">
                  {analytics.exam.expectedRank}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-2 p-3 sm:p-4">
            <h2 className="text-lg font-black sm:text-xl">Today’s Focus</h2>
            <p className="line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{primaryInsight}</p>
            <div className="rounded-md bg-cyan-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-cyan-800">Next task</p>
              <p className="mt-1 line-clamp-2 text-sm font-black text-cyan-950">{analytics.overview.upcomingStudyTask || "No planned task yet"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Quiz" value={analytics.overview.upcomingQuiz || "Not set"} />
              <MiniStat label="Suggested" value={`${analytics.aiInsights.suggestedStudyHours}h`} />
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {scorecard.map((item) => <Metric key={item.label} {...item} />)}
          </section>

          <Card className="p-3 sm:p-4">
            <ChartHeader title="Preparation Momentum" subtitle="Readiness, accuracy, and study hours in one view" icon={TrendingUp} />
            <div className="mt-3 h-52 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mergeSeries(analytics.charts.readinessTrend, analytics.charts.accuracyTrend, analytics.charts.studyHoursTrend)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="readiness" stroke="#7c3aed" strokeWidth={3} dot={false} />
                  <Line dataKey="accuracy" stroke="#0f766e" strokeWidth={3} dot={false} />
                  <Line dataKey="study" stroke="#f97316" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Legend items={[["Readiness", "#7c3aed"], ["Accuracy", "#0f766e"], ["Study hours", "#f97316"]]} />
          </Card>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <Card className="p-3 sm:p-4">
          <ChartHeader title="Planned vs Actual Study" subtitle="Daily execution against your plan" icon={Clock3} />
          <div className="mt-3 h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.charts.plannedVsActualStudyHours.length ? analytics.charts.plannedVsActualStudyHours : emptyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="planned" fill="#94a3b8" radius={[5, 5, 0, 0]} />
                <Bar dataKey="actual" fill="#0f766e" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-3 sm:p-4">
          <ChartHeader title="Quiz Score Trend" subtitle="Scores and goal completion over time" icon={Target} />
          <div className="mt-3 h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mergeTwo(analytics.charts.quizScoreTrend, analytics.charts.goalCompletionTrend, "score", "goal")}>
                <defs>
                  <linearGradient id="scoreFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Area dataKey="score" stroke="#2563eb" fill="url(#scoreFill)" strokeWidth={3} />
                <Line dataKey="goal" stroke="#f97316" strokeWidth={3} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[["Quiz score", "#2563eb"], ["Goal completion", "#f97316"]]} />
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1fr_360px]">
        <Card className="p-3 sm:p-4">
          <ChartHeader title="Subject Health" subtitle="Progress, accuracy, and confidence by subject" icon={Gauge} />
          <div className="mt-4 space-y-3">
            {subjectHealth.length === 0 ? <EmptyState text="Create a study plan to see subject health." /> : subjectHealth.map((subject) => (
              <div key={subject.subject} className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[180px_1fr_70px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{subject.subject}</p>
                  <p className="text-xs font-semibold text-slate-500">{subject.studyHours}h, {subject.questionsSolved} questions</p>
                </div>
                <div className="space-y-1">
                  <Progress label="Progress" value={subject.completion} color="bg-brand" />
                  <Progress label="Accuracy" value={subject.accuracy} color="bg-violet-600" />
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-1 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-500">Score</p>
                  <p className="text-lg font-black">{subject.confidenceScore}%</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-3 sm:p-4">
          <ChartHeader title="Time Distribution" subtitle="Where your study time goes" icon={Brain} />
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics.charts.subjectDistribution.length ? analytics.charts.subjectDistribution : [{ label: "No plan", value: 1 }]} dataKey="value" nameKey="label" innerRadius={46} outerRadius={76} paddingAngle={3}>
                  {(analytics.charts.subjectDistribution.length ? analytics.charts.subjectDistribution : [{ label: "No plan", value: 1 }]).map((_, index) => (
                    <Cell key={index} fill={palette[index % palette.length] ?? "#0f766e"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <Legend items={analytics.charts.subjectDistribution.slice(0, 5).map((item, index) => [item.label, palette[index % palette.length] ?? "#0f766e"])} />
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="overflow-hidden p-3 sm:p-4">
          <ChartHeader title="Weak Topic Priority" subtitle="Study these first" icon={Flame} />
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {weakTopics.length === 0 ? <EmptyState text="Take quizzes to reveal weak topics." /> : weakTopics.map((topic, index) => (
              <div key={`${topic.subject}-${topic.topic}`} className="rounded-md border border-slate-200 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black sm:text-sm">{index + 1}. {topic.topic}</p>
                    <p className="truncate text-xs font-semibold text-slate-500">{topic.subject} / {topic.difficultyLevel}</p>
                  </div>
                  <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-black text-rose-700">{topic.masteryScore}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.max(6, topic.masteryScore)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden p-3 sm:p-4">
          <ChartHeader title="Study Calendar Heatmap" subtitle="Consistency across recent days" icon={CalendarDays} />
          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {analytics.charts.monthlyHeatmap.map((day) => (
              <div key={day.label} className="rounded-md border border-slate-200 p-1.5 text-center sm:p-2">
                <p className="text-[10px] font-bold text-slate-500">{day.label}</p>
                <div className="mx-auto mt-1 h-5 rounded sm:h-6" style={{ backgroundColor: day.value > 0 ? `rgba(15, 118, 110, ${Math.min(0.9, 0.2 + day.value / 6)})` : "#f1f5f9" }} />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Completed" value={`${analytics.calendar.completedDays} days`} />
            <MiniStat label="Missed" value={`${analytics.calendar.missedDays} days`} />
            <MiniStat label="Weekly consistency" value={`${analytics.streaks.weeklyConsistency}%`} />
            <MiniStat label="Burnout risk" value={analytics.aiInsights.burnoutRisk} />
          </div>
        </Card>
      </section>

      <Card className="p-4">
        <ChartHeader title="Smart Coach Insights" subtitle="A short action list instead of noisy numbers" icon={Award} />
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {analytics.smartInsights.slice(0, 6).map((insight) => (
            <div key={insight} className="rounded-md bg-cyan-50 px-3 py-2 text-sm font-bold leading-6 text-cyan-950">{insight}</div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge label={`Strong: ${formatList(analytics.aiInsights.strongSubjects)}`} tone="bg-emerald-50 text-emerald-700" />
          <Badge label={`Weak: ${formatList(analytics.aiInsights.weakSubjects)}`} tone="bg-rose-50 text-rose-700" />
          <Badge label={`Next quiz: ${analytics.aiInsights.suggestedQuiz}`} tone="bg-violet-50 text-violet-700" />
        </div>
      </Card>

      <section className="grid gap-3 xl:grid-cols-2">
        <DetailsPanel title="Advanced Study, Planner, And Goal Details">
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniStat label="Total hours" value={`${analytics.study.totalStudyHours}h`} />
            <MiniStat label="Productive time" value={`${analytics.study.productiveStudyTime}h`} />
            <MiniStat label="Break time" value={`${analytics.study.breakTime}h`} />
            <MiniStat label="Best slot" value={analytics.study.mostProductiveTimeSlot} />
            <MiniStat label="Overdue tasks" value={String(analytics.planner.overdueTasks)} />
            <MiniStat label="Carry forward" value={String(analytics.planner.carryForwardTasks)} />
            <MiniStat label="Finish date" value={formatDisplayDate(analytics.planner.estimatedPlanCompletionDate)} />
            <MiniStat label="Daily goal" value={`${analytics.goals.dailyGoalProgress}%`} />
            <MiniStat label="Monthly goal" value={`${analytics.goals.monthlyGoalProgress}%`} />
          </div>
        </DetailsPanel>
        <DetailsPanel title="Advanced Quiz, Exam, And Achievement Details">
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniStat label="Highest score" value={`${analytics.quiz.highestScore}%`} />
            <MiniStat label="Wrong answers" value={String(analytics.quiz.wrongAnswers)} />
            <MiniStat label="Skipped" value={String(analytics.quiz.skippedQuestions)} />
            <MiniStat label="Time/question" value={`${analytics.quiz.timePerQuestion}s`} />
            <MiniStat label="Expected score" value={String(analytics.exam.expectedScore)} />
            <MiniStat label="Remaining hours" value={`${analytics.exam.remainingHours}h`} />
            <MiniStat label="Badges" value={String(analytics.achievements.badgesEarned.length)} />
            <MiniStat label="Milestones" value={String(analytics.achievements.milestonesCompleted.length)} />
            <MiniStat label="Perfect score" value={analytics.achievements.perfectScoreBadge ? "Yes" : "No"} />
          </div>
        </DetailsPanel>
      </section>
    </div>
  );
};

const mergeSeries = (readiness: TrendPoint[], accuracy: TrendPoint[], study: TrendPoint[]) => {
  const labels = [...new Set([...readiness, ...accuracy, ...study].map((item) => item.label))];
  return labels.map((label) => ({
    label,
    readiness: readiness.find((item) => item.label === label)?.value ?? 0,
    accuracy: accuracy.find((item) => item.label === label)?.value ?? 0,
    study: study.find((item) => item.label === label)?.value ?? 0
  }));
};

const mergeTwo = (first: TrendPoint[], second: TrendPoint[], firstKey: string, secondKey: string) => {
  const labels = [...new Set([...first, ...second].map((item) => item.label))];
  return labels.map((label) => ({
    label,
    [firstKey]: first.find((item) => item.label === label)?.value ?? 0,
    [secondKey]: second.find((item) => item.label === label)?.value ?? 0
  }));
};

const formatList = (items: string[]) => (items.length > 0 ? items.slice(0, 2).join(", ") : "No data yet");

const ProfilePill = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
    <span className="ml-1.5 text-sm font-black text-ink">{value}</span>
  </div>
);

const Metric = ({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Clock3; tone: string }) => (
  <Card className="p-2.5 sm:p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-lg font-black sm:text-xl">{value}</p>
        <p className="mt-1 truncate text-xs font-semibold text-slate-500">{detail}</p>
      </div>
      <Icon className={`size-6 shrink-0 ${tone}`} aria-hidden />
    </div>
  </Card>
);

const ChartHeader = ({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon: typeof Clock3 }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className="truncate text-lg font-black">{title}</h2>
      <p className="truncate text-sm text-slate-500">{subtitle}</p>
    </div>
    <Icon className="size-5 shrink-0 text-brand" aria-hidden />
  </div>
);

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
    <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 truncate text-sm font-black text-ink">{value}</p>
  </div>
);

const Progress = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div>
    <div className="mb-1 flex justify-between text-[11px] font-black uppercase tracking-wide text-slate-500">
      <span>{label}</span>
      <span>{value}%</span>
    </div>
    <div className="h-2 rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  </div>
);

const Legend = ({ items }: { items: Array<[string, string]> }) => (
  <div className="mt-2 flex flex-wrap gap-2">
    {items.map(([label, color]) => (
      <span key={label} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
    ))}
  </div>
);

const Badge = ({ label, tone }: { label: string; tone: string }) => (
  <span className={`rounded-md px-2.5 py-1.5 text-xs font-black ${tone}`}>{label}</span>
);

const DetailsPanel = ({ title, children }: { title: string; children: ReactNode }) => (
  <details className="group rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black">
      {title}
      <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
    </summary>
    <div className="mt-3">{children}</div>
  </details>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">{text}</div>
);
