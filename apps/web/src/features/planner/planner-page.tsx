import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { formatDisplayDate } from "../../utils/format";

interface StudyTask {
  id: string;
  date: string;
  examName: string;
  subject: string;
  topic: string;
  durationHours: number;
  done: boolean;
}

interface PlannerState {
  discoveredExams?: Array<{ id?: string; examName: string }>;
  selectedExamIds?: string[];
  activeExamId?: string;
  plan?: StudyTask[];
  dailyHours?: number;
  weeklyHours?: number;
  startDate?: string;
}

const dayLabel = (index: number) => `Day ${index + 1}`;
const examKey = (exam: { id?: string; examName: string }) => exam.id ?? exam.examName.trim().toLowerCase();
const todayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const PlannerPage = () => {
  const [state, setState] = useState<PlannerState>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadPlan = async () => {
      try {
        const response = await apiClient.get<{ data: PlannerState }>("/onboarding/state");
        if (mounted) setState(response.data.data);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void loadPlan();

    return () => {
      mounted = false;
    };
  }, []);

  const activeExam = useMemo(
    () => (state.discoveredExams ?? []).find((exam) => examKey(exam) === state.activeExamId) ?? (state.discoveredExams ?? []).find((exam) => (state.selectedExamIds ?? []).includes(examKey(exam))),
    [state.activeExamId, state.discoveredExams, state.selectedExamIds]
  );
  const plan = useMemo(() => (state.plan ?? []).filter((task) => !activeExam || task.examName === activeExam.examName), [activeExam, state.plan]);
  const today = todayIso();
  const currentIndex = plan.findIndex((task) => task.date >= today);
  const highlightedIndex = currentIndex >= 0 ? currentIndex : plan.length - 1;
  const currentTask = highlightedIndex >= 0 ? plan[highlightedIndex] : undefined;
  const upcoming = highlightedIndex >= 0 ? plan.slice(highlightedIndex, highlightedIndex + 10) : plan.slice(0, 10);

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm font-semibold text-slate-500">Loading your study plan...</p>
      </Card>
    );
  }

  if (plan.length === 0) {
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CalendarDays className="size-6 text-brand" aria-hidden />
          <h2 className="mt-4 text-xl font-bold">Smart Study Planner</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Set your preparation date and study hours first, then your saved plan will appear here.</p>
        </Card>
        <Card className="flex flex-col items-start justify-center gap-3">
          <p className="text-sm font-semibold text-slate-600">No plan has been set yet.</p>
          <Link to="/onboarding">
            <Button>Create plan</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[240px_1fr] lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-brand">
            <CalendarDays className="size-5" aria-hidden />
            Smart Study Planner
          </div>
          <h2 className="mt-2 text-lg font-black sm:text-xl">{plan.length} day plan</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">Starts {formatDisplayDate(state.startDate || plan[0]?.date)}.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <CompactStat label="Today" value={currentTask ? dayLabel(highlightedIndex) : "-"} />
          <CompactStat label="Daily" value={`${state.dailyHours ?? "-"} hrs`} />
          <CompactStat label="Weekly" value={`${state.weeklyHours ?? "-"} hrs`} />
          <CompactStat label="Remaining" value={`${Math.max(plan.length - Math.max(highlightedIndex, 0), 0)} days`} />
        </div>
      </Card>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Upcoming focus</h3>
          <span className="text-xs font-bold text-slate-400">Showing next {upcoming.length} tasks</span>
        </div>
        <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:max-h-none xl:grid-cols-5">
          {upcoming.map((task) => {
            const index = plan.findIndex((item) => item.id === task.id);
            const isCurrent = index === highlightedIndex;
            return (
              <div key={task.id} className={`rounded-md border p-2.5 sm:p-3 ${isCurrent ? "border-cyan-300 bg-cyan-50 shadow-soft" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs font-black ${isCurrent ? "text-cyan-900" : "text-slate-500"}`}>{dayLabel(index)}</p>
                  {isCurrent && <span className="rounded-md bg-cyan-600 px-2 py-0.5 text-[11px] font-black text-white">Current</span>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-black leading-5">{task.topic}</p>
                <p className="mt-2 text-xs font-semibold text-slate-500">{formatDisplayDate(task.date)}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-3 sm:p-4">
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {plan.map((task, index) => (
              <div
                key={task.id}
                className={`grid grid-cols-[52px_1fr_auto] gap-2 rounded-md border px-2.5 py-2 md:grid-cols-[72px_112px_1fr_88px] md:items-center ${
                  index === highlightedIndex ? "border-cyan-300 bg-cyan-50 ring-2 ring-cyan-100" : "border-slate-200 bg-white"
                }`}
              >
                <span className={`text-sm font-black ${index === highlightedIndex ? "text-cyan-950" : "text-slate-700"}`}>{dayLabel(index)}</span>
                <span className={`hidden rounded-md px-2 py-1 text-xs font-bold md:block ${index === highlightedIndex ? "bg-white text-cyan-950" : "bg-slate-50 text-slate-700"}`}>
                  {formatDisplayDate(task.date)}
                </span>
                <span>
                  <span className="block truncate text-sm font-black">{task.topic}</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">
                    {task.examName} / {task.subject}
                  </span>
                </span>
                <span className={`rounded-md px-2 py-1 text-xs font-black ${index === highlightedIndex ? "bg-cyan-600 text-white" : "bg-cyan-50 text-cyan-900"}`}>
                  {task.durationHours} hrs
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

const CompactStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
    <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
  </div>
);
