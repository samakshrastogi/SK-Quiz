import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, Brain, CalendarClock, Clock3, Flame, Target, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import { Card } from "../../components/ui/card";
import { formatDisplayDate, formatDisplayTime } from "../../utils/format";

interface StudyTask {
  id: string;
  date: string;
  examName: string;
  subject: string;
  topic: string;
  durationHours: number;
}

interface QuizHistoryItem {
  id: string;
  date: string;
  time: string;
  examName?: string;
  topic: string;
  status: string;
  score?: number;
  totalQuestions?: number;
  accuracy?: number;
}

interface DashboardState {
  discoveredExams?: Array<{ id?: string; examName: string }>;
  selectedExamIds?: string[];
  activeExamId?: string;
  plan?: StudyTask[];
  quizHistory?: QuizHistoryItem[];
  quizTime?: string;
  dailyHours?: number;
  weeklyHours?: number;
}

const todayIso = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const examKey = (exam: { id?: string; examName: string }) => exam.id ?? exam.examName.trim().toLowerCase();

export const DashboardPage = () => {
  const [state, setState] = useState<DashboardState>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await apiClient.get<{ data: DashboardState }>("/onboarding/state");
        if (mounted) setState(response.data.data);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const activeExam = (state.discoveredExams ?? []).find((exam) => examKey(exam) === state.activeExamId) ?? (state.discoveredExams ?? []).find((exam) => (state.selectedExamIds ?? []).includes(examKey(exam)));
  const plan = (state.plan ?? []).filter((task) => !activeExam || task.examName === activeExam.examName);
  const history = (state.quizHistory ?? []).filter((item) => !activeExam || item.examName === activeExam.examName);
  const today = todayIso();
  const todayTask = useMemo(() => plan.find((task) => task.date >= today) ?? plan[0], [plan, today]);
  const completed = history.filter((item) => item.status === "Completed");
  const averageAccuracy = completed.length > 0 ? Math.round(completed.reduce((sum, item) => sum + (item.accuracy ?? 0), 0) / completed.length) : 0;
  const chartData = (completed.length > 0 ? completed.slice(0, 7).reverse() : plan.slice(0, 7)).map((item, index) => ({
    day: `D${index + 1}`,
    accuracy: "accuracy" in item ? item.accuracy ?? 0 : 0
  }));
  const studyHours = plan.reduce((sum, task) => sum + task.durationHours, 0);
  const weakTopics = plan.slice(0, 3);

  if (isLoading) {
    return <Card><p className="text-sm font-semibold text-slate-500">Loading dashboard...</p></Card>;
  }

  return (
    <div className="space-y-4 pb-20 xl:pb-0">
      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-lg bg-ink p-5 text-white shadow-soft">
            <p className="text-sm font-semibold text-cyan-200">{activeExam?.examName ?? "Today's Goal"}</p>
          <h2 className="mt-2 max-w-3xl text-2xl font-black leading-tight sm:text-4xl">{todayTask?.topic ?? "Create your first adaptive study plan."}</h2>
          <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm">
            <span className="rounded-md bg-white/14 px-3 py-1.5">{todayTask?.durationHours ?? state.dailyHours ?? 0} h focus</span>
            <span className="rounded-md bg-white/14 px-3 py-1.5">{plan.length} planned days</span>
            <span className="rounded-md bg-white/14 px-3 py-1.5">{todayTask?.subject ?? "No subject selected"}</span>
          </div>
        </div>
        <Card className="flex flex-col justify-between bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Upcoming Quiz</p>
            <h3 className="mt-2 text-2xl font-bold">{todayTask?.subject ?? "No quiz scheduled"}</h3>
            <p className="mt-2 text-sm text-slate-500">{todayTask ? `${formatDisplayDate(todayTask.date)}, ${formatDisplayTime(state.quizTime)}. ${todayTask.topic}` : "Set a plan to schedule your next quiz."}</p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Award className="size-4" aria-hidden />
            {completed.length} quizzes completed
          </div>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Daily streak" value={`${Math.min(plan.length, 30)} days`} icon={Flame} tone="text-orange-600" />
        <Metric label="Questions solved" value={String(completed.reduce((sum, item) => sum + (item.totalQuestions ?? 0), 0))} icon={Brain} tone="text-brand" />
        <Metric label="Study hours" value={`${studyHours.toFixed(1)}h`} icon={Clock3} tone="text-emerald-600" />
        <Metric label="Readiness" value={`${averageAccuracy}%`} icon={Target} tone="text-violet-600" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Weekly Progress</p>
              <h3 className="text-xl font-bold">Accuracy Trend</h3>
            </div>
            <TrendingUp className="size-5 text-emerald-600" aria-hidden />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="accuracy" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Area type="monotone" dataKey="accuracy" stroke="#0f766e" fill="url(#accuracy)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-slate-500">Focus Topics</p>
          <div className="mt-4 space-y-4">
            {weakTopics.length === 0 ? (
              <p className="text-sm text-slate-500">No plan topics yet.</p>
            ) : (
              weakTopics.map((task, index) => (
                <div key={task.id}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="truncate font-semibold">{task.topic}</span>
                    <span className="text-slate-500">{formatDisplayDate(task.date)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(35, 85 - index * 15)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
};

const Metric = ({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof CalendarClock; tone: string }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-black">{value}</p>
      </div>
      <Icon className={`size-6 ${tone}`} aria-hidden />
    </div>
  </Card>
);
