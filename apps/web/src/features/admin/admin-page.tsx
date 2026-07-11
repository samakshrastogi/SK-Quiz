import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Activity, BarChart3, Brain, Clock3, GraduationCap, LineChart, LockKeyhole, LogIn, Search, ShieldCheck, Sparkles, Target, UserPlus, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiClient } from "../../api/client";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { formatDisplayDate, formatDuration } from "../../utils/format";

type Period = "daily" | "weekly" | "monthly" | "yearly" | "all_time";
type ModalType = "users" | "logins" | "exams" | "study" | "quizzes" | null;
type AdminModelData = NonNullable<AdminAnalytics["models"]>;

interface AdminAnalytics {
  summary: {
    userCount: number;
    activeUsers7d: number;
    activeUsers30d: number;
    trackedExamCount: number;
    totalRegisteredExams: number;
    planTasks: number;
    completedPlanTasks: number;
    planCompletionRate: number;
    studySeconds: number;
    quizRecords: number;
    quizUserCount: number;
    completedQuizzes: number;
    quizCompletionRate: number;
    averageAccuracy: number;
    planAdoptionRate: number;
    engagementRate: number;
  };
  roleDistribution: Array<{ label: string; value: number }>;
  providerDistribution: Array<{ label: string; value: number }>;
  examRows: Array<{ exam: string; users: number; plans: number; completedPlans: number; quizzes: number; completedQuizzes: number; plannedHours: number; averageAccuracy: number; completionRate: number }>;
  subjectRows: Array<{ subject: string; tasks: number; hours: number; completed: number; completionRate: number }>;
  timeline: Array<{ label: string; logins: number; signups: number; plannedHours: number; completedTasks: number; quizzes: number; accuracy: number }>;
  insights: string[];
  users: Array<{ id: string; name?: string; email: string; role: string; lastLoginAt?: string; lastActivityAt?: string; createdAt?: string }>;
  authEvents: Array<{ id: string; userId?: string; email?: string; event: string; provider?: string; createdAt?: string }>;
  models?: {
    usersByDate: Array<{ date: string; count: number; users: string[] }>;
    loginCounts: Array<{ user: string; counts: Record<string, number> }>;
    registeredExams: Array<{ exam: string; userCount: number; users: string[] }>;
    activeStudyTime: Array<{ user: string; secondsByDate: Record<string, number> }>;
    quizzes: Array<{ exam: string; userCounts: Record<string, number> }>;
  };
}

const emptyData: AdminAnalytics = {
  summary: {
    userCount: 0,
    activeUsers7d: 0,
    activeUsers30d: 0,
    trackedExamCount: 0,
    totalRegisteredExams: 0,
    planTasks: 0,
    completedPlanTasks: 0,
    planCompletionRate: 0,
    studySeconds: 0,
    quizRecords: 0,
    quizUserCount: 0,
    completedQuizzes: 0,
    quizCompletionRate: 0,
    averageAccuracy: 0,
    planAdoptionRate: 0,
    engagementRate: 0
  },
  roleDistribution: [],
  providerDistribution: [],
  examRows: [],
  subjectRows: [],
  timeline: [],
  insights: [],
  users: [],
  authEvents: [],
  models: {
    usersByDate: [],
    loginCounts: [],
    registeredExams: [],
    activeStudyTime: [],
    quizzes: []
  }
};

const colors = ["#0f766e", "#2563eb", "#7c3aed", "#f97316", "#e11d48", "#0891b2", "#65a30d"];

const bucketLabel = (label: string, period: Period) => {
  const date = new Date(label);
  if (Number.isNaN(date.getTime())) return label;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (period === "daily") return `${month}-${day}`;
  if (period === "weekly") {
    const firstDay = new Date(year, 0, 1);
    const week = Math.ceil(((date.getTime() - firstDay.getTime()) / 86_400_000 + firstDay.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  if (period === "monthly") return `${year}-${month}`;
  if (period === "all_time") return "All Time";
  return String(year);
};

const groupTimeline = (rows: AdminAnalytics["timeline"], period: Period) => {
  const buckets = new Map<string, AdminAnalytics["timeline"][number] & { accuracyValues: number[] }>();
  for (const row of rows) {
    const label = bucketLabel(row.label, period);
    const bucket = buckets.get(label) ?? { label, logins: 0, signups: 0, plannedHours: 0, completedTasks: 0, quizzes: 0, accuracy: 0, accuracyValues: [] };
    bucket.logins += row.logins;
    bucket.signups += row.signups;
    bucket.plannedHours += row.plannedHours;
    bucket.completedTasks += row.completedTasks;
    bucket.quizzes += row.quizzes;
    if (row.accuracy > 0) bucket.accuracyValues.push(row.accuracy);
    bucket.accuracy = bucket.accuracyValues.length > 0 ? Math.round(bucket.accuracyValues.reduce((sum, value) => sum + value, 0) / bucket.accuracyValues.length) : 0;
    buckets.set(label, bucket);
  }
  return [...buckets.values()].map(({ accuracyValues: _accuracyValues, ...row }) => ({ ...row, plannedHours: Number(row.plannedHours.toFixed(1)) })).slice(period === "all_time" ? -1 : -16);
};

export const AdminPage = () => {
  const [data, setData] = useState<AdminAnalytics>(emptyData);
  const [period, setPeriod] = useState<Period>("all_time");
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [makeAdminOpen, setMakeAdminOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await apiClient.get<{ data: AdminAnalytics }>("/admin/analytics");
        if (mounted) setData(response.data.data);
      } catch {
        if (mounted) {
          setData(emptyData);
          setError("Admin access is restricted to administrator accounts.");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const timeline = useMemo(() => groupTimeline(data.timeline, period), [data.timeline, period]);
  const topExams = data.examRows.filter((row) => row.exam !== "No exam").slice(0, 8);
  const lowAccuracy = data.examRows.filter((row) => row.quizzes > 0 && row.averageAccuracy > 0).sort((a, b) => a.averageAccuracy - b.averageAccuracy).slice(0, 4);
  const recentUsers = data.users.slice(0, 8);
  const models = data.models ?? emptyData.models!;
  const totalLoginCount = models.loginCounts.reduce((sum, row) => sum + Object.values(row.counts).reduce((innerSum, count) => innerSum + count, 0), 0);

  const makeSelectedAdmin = async () => {
    if (selectedUserIds.length === 0) return;
    await apiClient.post("/admin/make-admin", { userIds: selectedUserIds });
    setSelectedUserIds([]);
    setMakeAdminOpen(false);
    const response = await apiClient.get<{ data: AdminAnalytics }>("/admin/analytics");
    setData(response.data.data);
  };

  if (error && !isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="p-6">
          <LockKeyhole className="size-9 text-rose-600" aria-hidden />
          <h1 className="mt-4 text-2xl font-black">Admin Access Required</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
          <Link to="/profile" className="mt-5 inline-flex">
            <Button>Back to profile</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 xl:pb-0">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg bg-ink p-5 text-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-cyan-200">
              <ShieldCheck className="size-4" aria-hidden />
              Platform command center
            </p>
            <h1 className="mt-2 text-3xl font-black">Admin Smart Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Collective user, exam, study-plan, quiz, and engagement intelligence across the full platform.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              className="h-10 rounded-md border border-white/15 bg-white px-3 text-sm font-black text-ink"
              aria-label="Admin date range"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="all_time">All Time</option>
            </select>
            <Button type="button" variant="secondary" onClick={() => setMakeAdminOpen(true)}>
              <UserPlus className="size-4" aria-hidden />
              Make admin
            </Button>
          </div>
        </div>
      </motion.section>

      <section className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Metric label="Users" value={String(data.summary.userCount)} sub={`${data.summary.activeUsers7d} active 7d`} icon={Users} onClick={() => setActiveModal("users")} />
        <Metric label="Login Count" value={String(totalLoginCount)} sub="includes 1h returns" icon={LogIn} onClick={() => setActiveModal("logins")} />
        <Metric label="Registered Exams" value={String(data.summary.totalRegisteredExams)} sub={`${data.summary.trackedExamCount} unique exams`} icon={GraduationCap} onClick={() => setActiveModal("exams")} />
        <Metric label="Active Study Time" value={formatDuration(data.summary.studySeconds)} sub="visible tab only" icon={Clock3} onClick={() => setActiveModal("study")} />
        <Metric label="Quizzes" value={String(data.summary.quizRecords)} sub={`${data.summary.quizUserCount} users`} icon={Activity} onClick={() => setActiveModal("quizzes")} />
        <Metric label="Accuracy" value={`${data.summary.averageAccuracy}%`} sub="all-user average" icon={Target} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ChartTitle icon={LineChart} title="Growth And Engagement" legend={[["#0f766e", "Logins"], ["#2563eb", "Signups"], ["#7c3aed", "Quizzes"]]} />
          </div>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="loginFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Area isAnimationActive animationDuration={900} type="monotone" dataKey="logins" stroke="#0f766e" fill="url(#loginFill)" strokeWidth={2} />
                <Area isAnimationActive animationDuration={1100} type="monotone" dataKey="signups" stroke="#2563eb" fill="transparent" strokeWidth={2} />
                <Area isAnimationActive animationDuration={1200} type="monotone" dataKey="quizzes" stroke="#7c3aed" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <ChartTitle icon={GraduationCap} title="Exam Demand" legend={topExams.slice(0, 3).map((row, index) => [colors[index % colors.length] ?? "#0f766e", row.exam])} />
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie isAnimationActive animationDuration={900} data={topExams} dataKey="users" nameKey="exam" innerRadius={50} outerRadius={82} paddingAngle={2}>
                  {topExams.map((row, index) => <Cell key={row.exam} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="p-4">
          <ChartTitle icon={BarChart3} title="Active Platform Time" legend={[["#2563eb", "Active hours"], ["#f97316", "Completed tasks"]]} />
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar isAnimationActive animationDuration={900} dataKey="plannedHours" fill="#2563eb" radius={[5, 5, 0, 0]} />
                <Bar isAnimationActive animationDuration={1100} dataKey="completedTasks" fill="#f97316" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <ChartTitle icon={Brain} title="Smart Insights" legend={[]} />
          <div className="mt-3 grid gap-2">
            {data.insights.map((insight, index) => (
              <motion.div
                key={insight}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700"
              >
                <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                {insight}
              </motion.div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-3 sm:p-4">
          <h3 className="text-lg font-black">Top Exam Tracking</h3>
          <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
            <div className="min-w-[340px] sm:min-w-[520px]">
              <div className="grid grid-cols-[minmax(120px,1fr)_44px_54px_50px_62px] bg-slate-50 px-2 py-2 text-[10px] font-black uppercase text-slate-500 sm:grid-cols-[1fr_70px_80px_80px_80px] sm:px-3 sm:text-xs">
                <span>Exam</span><span>Users</span><span>Plan</span><span>Quiz</span><span>Accuracy</span>
              </div>
              {topExams.map((row) => (
                <div key={row.exam} className="grid grid-cols-[minmax(120px,1fr)_44px_54px_50px_62px] border-t border-slate-100 px-2 py-2 text-xs sm:grid-cols-[1fr_70px_80px_80px_80px] sm:px-3 sm:text-sm">
                  <span className="truncate font-bold">{row.exam}</span>
                  <span>{row.users}</span>
                  <span>{row.completedPlans}/{row.plans}</span>
                  <span>{row.completedQuizzes}/{row.quizzes}</span>
                  <span>{row.averageAccuracy}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-3 sm:p-4">
          <h3 className="text-lg font-black">Risk Watch</h3>
          <div className="mt-3 space-y-2">
            {lowAccuracy.length === 0 ? (
              <p className="rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-700">No low-accuracy exam risk detected yet.</p>
            ) : (
              lowAccuracy.map((row) => (
                <div key={row.exam} className="rounded-md border border-rose-100 bg-rose-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black">{row.exam}</p>
                    <span className="rounded bg-white px-2 py-1 text-xs font-black text-rose-700">{row.averageAccuracy}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white">
                    <div className="h-2 rounded-full bg-rose-500 transition-all duration-700" style={{ width: `${Math.max(5, row.averageAccuracy)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-3 sm:p-4">
          <h3 className="text-lg font-black">Auth Mix</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <MiniDistribution title="Roles" rows={data.roleDistribution} />
            <MiniDistribution title="Providers" rows={data.providerDistribution} />
          </div>
        </Card>
        <Card className="p-3 sm:p-4">
          <h3 className="text-lg font-black">Recent Users</h3>
          <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1">
            {recentUsers.map((user) => (
              <div key={user.id} className="grid gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm sm:grid-cols-[1fr_100px_130px]">
                <span className="truncate font-bold">{user.email}</span>
                <span className="rounded bg-slate-50 px-2 py-1 text-xs font-black uppercase text-slate-500">{user.role}</span>
                <span className="text-xs font-semibold text-slate-500">{user.lastActivityAt ? formatDisplayDate(user.lastActivityAt) : "No activity"}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>
      {activeModal && (
        <AdminDataModal
          type={activeModal}
          data={models}
          onClose={() => setActiveModal(null)}
        />
      )}
      {makeAdminOpen && (
        <MakeAdminModal
          users={data.users}
          selectedUserIds={selectedUserIds}
          onToggle={(id) => setSelectedUserIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
          onCancel={() => setMakeAdminOpen(false)}
          onSubmit={() => void makeSelectedAdmin()}
        />
      )}
    </div>
  );
};

const Metric = ({ label, value, sub, icon: Icon, onClick }: { label: string; value: string; sub: string; icon: typeof Users; onClick?: () => void }) => (
  <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <Card className={onClick ? "flex h-full cursor-pointer p-4 transition hover:-translate-y-0.5 hover:border-brand/40" : "flex h-full p-4"} onClick={onClick}>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 break-words text-lg font-black leading-tight sm:text-xl 2xl:text-2xl">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>
        </div>
        <Icon className="size-5 shrink-0 text-brand" aria-hidden />
      </div>
    </Card>
  </motion.div>
);

const ChartTitle = ({ icon: Icon, title, legend }: { icon: typeof Users; title: string; legend: string[][] }) => (
  <div className="flex w-full flex-wrap items-center justify-between gap-3">
    <h3 className="flex items-center gap-2 text-lg font-black">
      <Icon className="size-5 text-brand" aria-hidden />
      {title}
    </h3>
    {legend.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {legend.map(([color, label]) => (
          <span key={`${color}-${label}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="max-w-[140px] truncate">{label}</span>
          </span>
        ))}
      </div>
    )}
  </div>
);

const MiniDistribution = ({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) => {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className="rounded-md border border-slate-200 p-2.5 sm:p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 space-y-1.5">
        {rows.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">No data yet.</p>
        ) : (
          rows.map((row, index) => (
            <div key={row.label}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-bold capitalize">{row.label}</span>
                <span className="font-black">{row.value}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${total > 0 ? Math.max(4, (row.value / total) * 100) : 0}%`, backgroundColor: colors[index % colors.length] }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const AdminDataModal = ({ type, data, onClose }: { type: Exclude<ModalType, null>; data: AdminModelData; onClose: () => void }) => {
  const [query, setQuery] = useState("");
  const titleMap = {
    users: "Users",
    logins: "Login Count",
    exams: "Registered Exams",
    study: "Active Study Time",
    quizzes: "Quizzes"
  };
  const normalizedQuery = query.trim().toLowerCase();
  const filterText = (value: string) => value.toLowerCase().includes(normalizedQuery);
  const loginDates = uniqueDates(data.loginCounts.flatMap((row) => Object.keys(row.counts)));
  const usageDates = uniqueDates(data.activeStudyTime.flatMap((row) => Object.keys(row.secondsByDate)));
  const quizUsers = [...new Set(data.quizzes.flatMap((row) => Object.keys(row.userCounts)))].sort();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-3 py-6 backdrop-blur-sm" onMouseDown={onClose} role="presentation">
      <Card className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden p-0" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-brand">Admin model</p>
            <h2 className="text-xl font-black">{titleMap[type]}</h2>
          </div>
          <label className="ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-slate-200 px-3 sm:w-64">
            <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
            <Input className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" placeholder="Search..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" onClick={onClose} className="flex size-9 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {type === "users" && (
            <CompactTable columns={["Date", "Count", "Name of users"]}>
              {data.usersByDate.filter((row) => filterText(`${row.date} ${row.users.join(" ")}`)).map((row) => (
                <TableRow key={row.date} cells={[formatDisplayDate(row.date), String(row.count), row.users.join(", ")]} />
              ))}
            </CompactTable>
          )}
          {type === "logins" && (
            <CompactTable columns={["Users name", ...loginDates.map(formatDisplayDate)]}>
              {data.loginCounts.filter((row) => filterText(row.user)).map((row) => (
                <TableRow key={row.user} cells={[row.user, ...loginDates.map((date) => String(row.counts[date] ?? 0))]} />
              ))}
            </CompactTable>
          )}
          {type === "exams" && (
            <CompactTable columns={["Exam name", "Users count", "Users name"]}>
              {data.registeredExams.filter((row) => filterText(`${row.exam} ${row.users.join(" ")}`)).map((row) => (
                <TableRow key={row.exam} cells={[row.exam, String(row.userCount), row.users.join(", ")]} />
              ))}
            </CompactTable>
          )}
          {type === "study" && (
            <CompactTable columns={["Users name", ...usageDates.map(formatDisplayDate)]}>
              {data.activeStudyTime.filter((row) => filterText(row.user)).map((row) => (
                <TableRow key={row.user} cells={[row.user, ...usageDates.map((date) => formatDuration(row.secondsByDate[date] ?? 0))]} />
              ))}
            </CompactTable>
          )}
          {type === "quizzes" && (
            <CompactTable columns={["Exam name", ...quizUsers]}>
              {data.quizzes.filter((row) => filterText(`${row.exam} ${Object.keys(row.userCounts).join(" ")}`)).map((row) => (
                <TableRow key={row.exam} cells={[row.exam, ...quizUsers.map((user) => String(row.userCounts[user] ?? 0))]} />
              ))}
            </CompactTable>
          )}
        </div>
      </Card>
    </div>
  );
};

const MakeAdminModal = ({
  users,
  selectedUserIds,
  onToggle,
  onCancel,
  onSubmit
}: {
  users: AdminAnalytics["users"];
  selectedUserIds: string[];
  onToggle: (id: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) => {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const rows = users.filter((user) => `${user.name ?? ""} ${user.email}`.toLowerCase().includes(normalizedQuery));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-3 py-6 backdrop-blur-sm" onMouseDown={onCancel} role="presentation">
      <Card className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden p-0" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-brand">Role management</p>
            <h2 className="text-xl font-black">Make admin</h2>
          </div>
          <label className="ml-auto hidden h-9 w-64 items-center gap-2 rounded-md border border-slate-200 px-3 sm:flex">
            <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
            <Input className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" placeholder="Search users..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" onClick={onCancel} className="flex size-9 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="border-b border-slate-200 p-3 sm:hidden">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
            <Search className="size-4 text-slate-400" aria-hidden />
            <Input className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" placeholder="Search users..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <CompactTable columns={["", "Name", "Email id"]}>
            {rows.map((user) => (
              <TableRow
                key={user.id}
                cells={[
                  <input key="checkbox" type="checkbox" checked={selectedUserIds.includes(user.id)} onChange={() => onToggle(user.id)} />,
                  user.name ?? user.email.split("@")[0],
                  user.email
                ]}
              />
            ))}
          </CompactTable>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSubmit} disabled={selectedUserIds.length === 0}>Make admin</Button>
        </div>
      </Card>
    </div>
  );
};

const uniqueDates = (dates: string[]) => [...new Set(dates.filter(Boolean))].sort((a, b) => b.localeCompare(a)).slice(0, 12);

const CompactTable = ({ columns, children }: { columns: string[]; children: ReactNode }) => (
  <div className="overflow-auto rounded-md border border-slate-200">
    <div className="grid min-w-max bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(140px, 1fr))` }}>
      {columns.map((column) => <div key={column} className="border-r border-slate-200 px-3 py-2 last:border-r-0">{column}</div>)}
    </div>
    <div className="min-w-max divide-y divide-slate-100">{children}</div>
  </div>
);

const TableRow = ({ cells }: { cells: ReactNode[] }) => (
  <div className="grid text-sm" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(140px, 1fr))` }}>
    {cells.map((cell, index) => (
      <div key={index} className="min-w-0 border-r border-slate-100 px-3 py-2 last:border-r-0">
        <span className="block truncate font-semibold text-slate-700">{cell}</span>
      </div>
    ))}
  </div>
);
