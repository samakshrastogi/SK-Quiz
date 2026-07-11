import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/card";
import { apiClient } from "../../api/client";

interface AnalyticsState {
  discoveredExams?: Array<{ id?: string; examName: string }>;
  selectedExamIds?: string[];
  activeExamId?: string;
  plan?: Array<{ examName: string; subject: string; durationHours: number }>;
  quizHistory?: Array<{ examName?: string; date: string; accuracy?: number; totalQuestions?: number; status: string }>;
}
const examKey = (exam: { id?: string; examName: string }) => exam.id ?? exam.examName.trim().toLowerCase();

export const AnalyticsPage = () => {
  const [state, setState] = useState<AnalyticsState>({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const response = await apiClient.get<{ data: AnalyticsState }>("/onboarding/state");
      if (mounted) setState(response.data.data);
    };
    void load().catch(() => mounted && setState({}));
    return () => {
      mounted = false;
    };
  }, []);

  const activeExam = (state.discoveredExams ?? []).find((exam) => examKey(exam) === state.activeExamId) ?? (state.discoveredExams ?? []).find((exam) => (state.selectedExamIds ?? []).includes(examKey(exam)));
  const plan = (state.plan ?? []).filter((task) => !activeExam || task.examName === activeExam.examName);
  const completed = (state.quizHistory ?? []).filter((item) => item.status === "Completed" && (!activeExam || item.examName === activeExam.examName));
  const accuracy = completed.length > 0 ? completed.slice(0, 8).reverse().map((item, index) => ({ label: `Q${index + 1}`, accuracy: item.accuracy ?? 0 })) : [{ label: "No data", accuracy: 0 }];
  const subjects = useMemo(() => {
    const totals = new Map<string, number>();
    for (const task of plan) totals.set(task.subject, (totals.get(task.subject) ?? 0) + task.durationHours);
    return [...totals.entries()].slice(0, 8).map(([subject, value]) => ({ subject, value: Number(value.toFixed(1)) }));
  }, [plan]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="text-xl font-bold">Quiz Accuracy</h2>
        <div className="mt-5 h-80">
          <ResponsiveContainer>
            <LineChart data={accuracy}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line dataKey="accuracy" stroke="#0f766e" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">Study Time Distribution</h2>
        <div className="mt-5 h-80">
          <ResponsiveContainer>
            <BarChart data={subjects.length > 0 ? subjects : [{ subject: "No plan", value: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="subject" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#164e63" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};
