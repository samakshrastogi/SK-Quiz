import type { ExamDiscoveryResult } from "@ai-quiz-coach/shared";
import { useNavigate } from "@tanstack/react-router";
import axios from "axios";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Info,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

type Priority = "High" | "Medium" | "Low";
type StepId = "exam" | "details" | "subjects" | "time" | "plan";
type DynamicExam = ExamDiscoveryResult & { id?: string };

interface SubjectPreference {
  id: string;
  examId: string;
  examName: string;
  phase: string;
  name: string;
  topics: string[];
  priority: Priority;
  favorite: boolean;
}

interface StudyTask {
  id: string;
  date: string;
  examName: string;
  subject: string;
  topic: string;
  durationHours: number;
  done: boolean;
}

interface SetupState {
  examSearch: string;
  discoveredExams: DynamicExam[];
  selectedExamIds: string[];
  subjectPreferences: SubjectPreference[];
  startDate: string;
  dailyHours: number;
  weeklyHours: number;
  quizTime: string;
  plan: StudyTask[];
  completedTopics: string[];
}

const steps: Array<{ id: StepId; label: string; icon: typeof GraduationCap }> = [
  { id: "exam", label: "Exams", icon: GraduationCap },
  { id: "details", label: "Details", icon: Info },
  { id: "subjects", label: "Priorities", icon: Target },
  { id: "time", label: "Time", icon: CalendarDays },
  { id: "plan", label: "Plan", icon: ClipboardList }
];

const defaultState: SetupState = {
  examSearch: "",
  discoveredExams: [],
  selectedExamIds: [],
  subjectPreferences: [],
  startDate: "",
  dailyHours: 3,
  weeklyHours: 18,
  quizTime: "19:30",
  plan: [],
  completedTopics: []
};

const normalizeLoadedState = (state: Partial<SetupState>): SetupState => {
  const loaded = { ...defaultState, ...state };
  const discoveredExams = safeArray(loaded.discoveredExams);

  return {
    ...loaded,
    discoveredExams,
    selectedExamIds: safeArray(loaded.selectedExamIds),
    subjectPreferences: safeArray(loaded.subjectPreferences),
    plan: safeArray(loaded.plan),
    completedTopics: safeArray(loaded.completedTopics)
  };
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
};

const todayIso = () => formatLocalDate(new Date());
const formatTime = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const parseLocalDateTime = (date: string, time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  const parsedDate = parseLocalDate(date);
  parsedDate.setHours(hour || 0, minute || 0, 0, 0);
  return parsedDate;
};
const minimumScheduleDateTime = () => {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 5, 0, 0);
  return next;
};

const addDays = (date: string, days: number) => {
  const next = parseLocalDate(date);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
};

const examKey = (exam: DynamicExam) => exam.id ?? exam.examName.trim().toLowerCase();
const safeArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);
const getDetailedSyllabus = (exam: DynamicExam) => {
  const detailed = safeArray(exam.detailedSyllabus).map((phase) => ({
    phase: phase.phase || "Syllabus",
    sections: safeArray(phase.sections).map((section) => ({
      title: section.title || "Section",
      topics: safeArray(section.topics)
    }))
  }));

  if (detailed.length > 0) return detailed;

  return safeArray(exam.subjects).map((subject) => ({
    phase: subject.name,
    sections: safeArray(subject.topics).map((topic) => ({
      title: topic.name,
      topics: safeArray(topic.subtopics).map((subtopic) => subtopic.name)
    }))
  }));
};

const buildSubjectPreferences = (selectedExams: DynamicExam[], existing: SubjectPreference[]) =>
  selectedExams.flatMap((exam) =>
    getDetailedSyllabus(exam).flatMap((phase, phaseIndex) =>
      phase.sections.map((section, sectionIndex) => {
        const id = `${examKey(exam)}-${phase.phase}-${section.title}-${phaseIndex}-${sectionIndex}`;
        const found = existing.find((item) => item.id === id);
        return {
          id,
          examId: examKey(exam),
          examName: exam.examName,
          phase: phase.phase,
          name: section.title,
          topics: section.topics,
          priority: found?.priority ?? "Medium",
          favorite: found?.favorite ?? false
        };
      })
    )
  );

const topicDurationHours = (priority: Priority, dailyHours: number) => {
  const comfortableHours = dailyHours <= 2 ? dailyHours : dailyHours - 0.25;
  const priorityCap = priority === "High" ? 3 : priority === "Medium" ? 2.5 : 2;
  return Number(Math.max(0.75, Math.min(comfortableHours, priorityCap)).toFixed(2));
};

const topicPlanParts = (topic: string) => {
  const lower = topic.toLowerCase();
  if (lower.includes("puzzle") || lower.includes("seating")) {
    return [
      "Linear Arrangement (Concepts)",
      "Linear Arrangement (Basic Questions)",
      "Circular Arrangement",
      "Square & Rectangular Arrangement",
      "Floor & Box Puzzles",
      "Mixed High-Level Questions",
      "Seating Arrangement Revision + Sectional Test"
    ];
  }
  if (lower.includes("syllogism")) {
    return ["Basic Concepts", "Traditional Syllogism", "Reverse Syllogism", "Advanced Syllogism", "PYQs & Mixed Practice", "Speed Practice", "Syllogism Revision + Mock"];
  }
  if (lower.includes("inequal")) {
    return ["Basic Concepts", "Coded Inequalities", "Mixed Practice", "Revision + Timed Test"];
  }
  if (lower.includes("data interpretation") || lower === "di") {
    return [
      "Tables (Concepts + Basic Sets)",
      "Bar Graphs",
      "Line Graphs",
      "Pie Charts",
      "Caselet DI",
      "Missing DI",
      "Mixed Arithmetic DI",
      "High-Level Sets",
      "PYQs & Speed Practice",
      "DI Revision + Sectional Test"
    ];
  }
  if (lower.includes("number series")) {
    return ["Basic Patterns", "Missing Number Series", "Wrong Number Series", "Revision + Timed Practice"];
  }
  if (lower.includes("arithmetic")) {
    return [
      "Percentage (Concepts)",
      "Percentage (Practice)",
      "Ratio & Proportion",
      "Average",
      "Profit & Loss",
      "Simple & Compound Interest",
      "Time & Work",
      "Pipes & Cisterns",
      "Time, Speed & Distance",
      "Boats & Streams",
      "Trains",
      "Mixture & Alligation",
      "Partnership",
      "Mensuration Basics",
      "Probability",
      "Permutation & Combination",
      "Data Sufficiency",
      "Word Problem Translation",
      "Mixed Easy Set",
      "Mixed Moderate Set",
      "Mixed High-Level Set",
      "PYQs Set 1",
      "PYQs Set 2",
      "Speed Practice 1",
      "Speed Practice 2",
      "Error Analysis",
      "Formula Revision",
      "Arithmetic Revision + Mock"
    ];
  }

  return ["Concepts", "Examples", "Basic Questions", "PYQs & Mixed Practice", "Revision + Sectional Test"];
};

const generatePlan = (subjects: SubjectPreference[], dailyHours: number, weeklyHours: number, startDate: string) => {
  const start = startDate || todayIso();
  const ranked = [...subjects].sort((a, b) => {
    const score = { High: 0, Medium: 1, Low: 2 };
    return score[a.priority] - score[b.priority];
  });
  const tasks: StudyTask[] = [];
  let dayIndex = 0;
  const normalizedDailyHours = Math.min(Math.max(0.5, dailyHours), Math.max(0.75, weeklyHours / 7));

  ranked.forEach((subject) => {
    subject.topics.forEach((topic) => {
      const durationHours = topicDurationHours(subject.priority, normalizedDailyHours);
      topicPlanParts(topic).forEach((part) => {
        const isRevision = part.toLowerCase().includes("revision") || part.toLowerCase().includes("mock") || part.toLowerCase().includes("test");
        tasks.push({
          id: `${subject.id}-${topic}-${part}-${tasks.length}`,
          date: addDays(start, dayIndex),
          examName: subject.examName,
          subject: isRevision ? "Revision" : subject.name,
          topic: `${topic} - ${part}`,
          durationHours,
          done: false
        });
        dayIndex += 1;
      });
    });
  });

  return tasks;
};

const mergePlanByExam = (existingPlan: StudyTask[], generatedPlan: StudyTask[]) => {
  const generatedExamNames = new Set(generatedPlan.map((task) => task.examName));
  return [...existingPlan.filter((task) => !generatedExamNames.has(task.examName)), ...generatedPlan];
};

const removeSelectedExamPlan = (plan: StudyTask[], subjectPreferences: SubjectPreference[]) => {
  const examNames = new Set(subjectPreferences.map((subject) => subject.examName));
  return plan.filter((task) => !examNames.has(task.examName));
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string; error?: { message?: string } } | undefined)?.message;
    const nested = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    return message ?? nested ?? error.message;
  }
  return error instanceof Error ? error.message : "Unable to discover this exam.";
};

export const OnboardingPage = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState<StepId>("exam");
  const [unlockedStepIndex, setUnlockedStepIndex] = useState(1);
  const [setup, setSetup] = useState<SetupState>(defaultState);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [canAutoSave, setCanAutoSave] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isPlanEditing, setIsPlanEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [examSuggestions, setExamSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const selectedExams = useMemo(() => setup.discoveredExams.filter((exam) => setup.selectedExamIds.includes(examKey(exam))), [setup.discoveredExams, setup.selectedExamIds]);
  useEffect(() => {
    const query = setup.examSearch.trim();
    if (query.length < 2 || query.includes(",")) {
      setExamSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsLoadingSuggestions(true);
      void apiClient
        .get<{ data: string[] }>("/onboarding/suggestions", { params: { q: query }, signal: controller.signal })
        .then((response) => setExamSuggestions(response.data.data))
        .catch((error: unknown) => {
          if (!axios.isCancel(error)) setExamSuggestions([]);
        })
        .finally(() => setIsLoadingSuggestions(false));
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [setup.examSearch]);
  useEffect(() => {
    let mounted = true;

    const loadRemoteState = async () => {
      try {
        window.localStorage.removeItem("sk-quiz-coach-onboarding-v3");
        const response = await apiClient.get<{ data: Partial<SetupState> }>("/onboarding/state");
        if (!mounted) return;
        setSetup(normalizeLoadedState(response.data.data));
        setCanAutoSave(true);
      } catch {
        if (!mounted) return;
        setErrorMessage("Your saved setup could not be loaded. Please refresh before making changes.");
        setCanAutoSave(false);
      } finally {
        if (mounted) setIsStateLoaded(true);
      }
    };

    void loadRemoteState();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isStateLoaded || !canAutoSave) return;

    const timeout = window.setTimeout(() => {
      void apiClient.put("/onboarding/state", { state: setup });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [canAutoSave, isStateLoaded, setup]);

  const saveSetup = async () => {
    await apiClient.put("/onboarding/state", { state: setup });
  };

  const discoverExam = async () => {
    const examNames = setup.examSearch
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (examNames.length === 0) {
      setErrorMessage("Type at least one exam name. You can separate multiple exams with commas.");
      return;
    }

    setIsDiscovering(true);
    setErrorMessage("");

    try {
      const results = await Promise.all(
        examNames.map(async (examName) => {
          const response = await apiClient.post<{ data: DynamicExam }>("/onboarding/discover", { examName });
          return response.data.data;
        })
      );

      setSetup((current) => {
        const merged = [...current.discoveredExams];
        for (const exam of results) {
          const key = examKey(exam);
          const index = merged.findIndex((item) => examKey(item) === key);
          if (index >= 0) {
            merged[index] = exam;
          } else {
            merged.push(exam);
          }
        }
        return { ...current, discoveredExams: merged, examSearch: "" };
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsDiscovering(false);
    }
  };

  const updateSelectedExam = (exam: DynamicExam) => {
    setSetup((current) => {
      const id = examKey(exam);
      const selectedExamIds = current.selectedExamIds.includes(id) ? current.selectedExamIds.filter((item) => item !== id) : [...current.selectedExamIds, id];
      const selected = current.discoveredExams.filter((item) => selectedExamIds.includes(examKey(item)));
      return {
        ...current,
        selectedExamIds,
        subjectPreferences: buildSubjectPreferences(selected, current.subjectPreferences)
      };
    });
  };

  const updateSubject = (id: string, patch: Partial<SubjectPreference>) => {
    setSetup((current) => ({
      ...current,
      subjectPreferences: current.subjectPreferences.map((subject) => (subject.id === id ? { ...subject, ...patch } : subject)),
      plan: removeSelectedExamPlan(current.plan, current.subjectPreferences)
    }));
  };

  const moveSubject = (index: number, direction: -1 | 1) => {
    setSetup((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.subjectPreferences.length) return current;
      const subjectPreferences = [...current.subjectPreferences];
      const [item] = subjectPreferences.splice(index, 1);
      if (!item) return current;
      subjectPreferences.splice(nextIndex, 0, item);
      return { ...current, subjectPreferences, plan: removeSelectedExamPlan(current.plan, current.subjectPreferences) };
    });
  };

  const updateTask = (id: string, patch: Partial<StudyTask>) => {
    setSetup((current) => ({
      ...current,
      plan: current.plan.map((task) => (task.id === id ? { ...task, ...patch } : task))
    }));
  };

  const removeTask = (id: string) => {
    setSetup((current) => ({ ...current, plan: current.plan.filter((task) => task.id !== id) }));
  };

  const appendLeftoverTasks = () => {
    setSetup((current) => {
      const lastDate = current.plan.reduce((latest, task) => (task.date > latest ? task.date : latest), todayIso());
      const leftovers = current.plan
        .filter((task) => !task.done)
        .map((task, index) => ({
          ...task,
          id: `${task.id}-carry-${Date.now()}-${index}`,
          date: addDays(lastDate, index + 1),
          done: false
        }));
      return { ...current, plan: [...current.plan, ...leftovers] };
    });
  };

  const createPlan = () => {
    setSetup((current) => ({
      ...current,
      startDate: current.startDate || todayIso(),
      quizTime:
        (current.startDate || todayIso()) === todayIso() && parseLocalDateTime(todayIso(), current.quizTime) < minimumScheduleDateTime()
          ? formatTime(minimumScheduleDateTime())
          : current.quizTime,
      plan: mergePlanByExam(
        current.plan,
        generatePlan(current.subjectPreferences, current.dailyHours, current.weeklyHours, current.startDate || todayIso())
      )
    }));
    setIsPlanEditing(false);
    setUnlockedStepIndex(4);
    setActiveStep("plan");
  };

  const setPlanAndOpenPlanner = async () => {
    await saveSetup();
    await navigate({ to: "/quiz" });
  };

  const selectedExamNames = selectedExams.map((exam) => exam.examName).join(", ");
  const stepOrder = steps.map((step) => step.id);
  const unlockAndGo = (stepId: StepId) => {
    const nextIndex = stepOrder.indexOf(stepId);
    setUnlockedStepIndex((current) => Math.max(current, nextIndex));
    setActiveStep(stepId);
  };
  const isStepEnabled = (stepId: StepId) => {
    const index = stepOrder.indexOf(stepId);
    if (index > unlockedStepIndex) return false;
    if (stepId === "exam") return true;
    if (stepId === "details") return setup.selectedExamIds.length > 0;
    if (stepId === "subjects") return selectedExams.length > 0;
    if (stepId === "time") return setup.subjectPreferences.length > 0;
    if (stepId === "plan") return setup.plan.length > 0;
    return false;
  };

  if (!isStateLoaded) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="space-y-3">
          <Sparkles className="size-7 text-brand" aria-hidden />
          <h2 className="text-2xl font-black">Loading your setup</h2>
          <p className="text-sm leading-6 text-slate-500">Fetching your exam plan from the database.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-20 xl:pb-4">
      <section className="rounded-lg bg-ink px-3 py-3 text-white shadow-soft sm:px-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-cyan-200">
              <Sparkles className="size-4" aria-hidden />
              Dynamic exam setup
            </span>
            <span className="text-sm font-semibold text-white sm:text-base">Build a complete preparation flow from any exam name.</span>
            <span className="hidden text-xs font-medium text-white/60 sm:inline sm:text-sm">Exam details, syllabus, plan, and quiz stay personalized to your selected exam.</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm lg:min-w-[420px]">
            <MetricDarkCompact label="Discovered" value={String(setup.discoveredExams.length)} />
            <MetricDarkCompact label="Selected" value={String(setup.selectedExamIds.length)} />
            <MetricDarkCompact label="Prepared" value={String(setup.completedTopics.length)} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {steps.map((step) => {
          const enabled = isStepEnabled(step.id);
          return (
            <button
              key={step.id}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && setActiveStep(step.id)}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-md border px-1.5 text-xs font-bold transition sm:min-h-12 sm:gap-2 sm:px-3 sm:text-sm ${
                activeStep === step.id
                  ? "border-ink bg-ink text-white"
                  : enabled
                    ? "border-slate-200 bg-white text-slate-600 hover:border-ink hover:text-ink"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              }`}
            >
              <step.icon className="size-4" aria-hidden />
              <span className="truncate">{step.label}</span>
            </button>
          );
        })}
      </div>

      {activeStep === "exam" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-2xl font-black">Which exam do you want to prepare for?</h3>
            <p className="mt-1 text-sm text-slate-500">Type any exam name. For multiple exams, separate names with commas.</p>
          </div>
          <Card className="space-y-3 p-3 sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="relative">
                <Input
                  value={setup.examSearch}
                  onChange={(event) => setSetup((current) => ({ ...current, examSearch: event.target.value }))}
                  placeholder="Example: UPSC CSE, SSC CGL, CAT, GATE CS"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={examSuggestions.length > 0}
                  aria-controls="exam-suggestions"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void discoverExam();
                    }
                  }}
                />
                {(examSuggestions.length > 0 || isLoadingSuggestions) && (
                  <div id="exam-suggestions" role="listbox" className="absolute inset-x-0 top-[calc(100%+0.4rem)] z-30 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-soft">
                    {isLoadingSuggestions && examSuggestions.length === 0 ? (
                      <p className="px-3 py-2 text-sm font-semibold text-slate-500">Finding official exam names...</p>
                    ) : examSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        role="option"
                        aria-selected={setup.examSearch === suggestion}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-brand/5 hover:text-brand"
                        onClick={() => {
                          setSetup((current) => ({ ...current, examSearch: suggestion }));
                          setExamSuggestions([]);
                          setErrorMessage("");
                        }}
                      >
                        <Search className="size-4 shrink-0 text-brand" aria-hidden />
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={() => void discoverExam()} disabled={isDiscovering}>
                <Search className="size-4" aria-hidden />
                {isDiscovering ? "Discovering..." : "Discover exam"}
              </Button>
            </div>
            {errorMessage && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{errorMessage}</p>}
            <p className="text-sm leading-6 text-slate-500">
              Discovery may take a few seconds the first time.
            </p>
          </Card>

          {setup.discoveredExams.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {setup.discoveredExams.map((exam) => {
                const selected = setup.selectedExamIds.includes(examKey(exam));
                return (
                  <button
                    key={examKey(exam)}
                    type="button"
                    onClick={() => updateSelectedExam(exam)}
                    className={`rounded-lg border bg-white p-3 text-left shadow-soft transition sm:p-5 ${
                      selected ? "border-ink ring-2 ring-ink/10" : "border-slate-200 hover:border-brand"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-black sm:text-lg">{exam.examName}</p>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{exam.purpose || exam.overview}</p>
                      </div>
                      {selected && <CheckCircle2 className="size-6 shrink-0 text-brand" aria-hidden />}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {safeArray(exam.subjects).slice(0, 3).map((subject) => (
                        <span key={subject.name} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                          {subject.name}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <Button disabled={setup.selectedExamIds.length === 0} onClick={() => unlockAndGo("details")}>
            Continue to exam details
          </Button>
        </div>
      )}

      {activeStep === "details" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-2xl font-black">Complete exam guide</h3>
              <p className="mt-1 text-sm text-slate-500">
                {selectedExamNames ? `Student-friendly guide for ${selectedExamNames}.` : "Discover and select an exam to view the guide."}
              </p>
            </div>
            <Button className="w-full sm:w-auto" disabled={selectedExams.length === 0} onClick={() => unlockAndGo("subjects")}>
              Prioritize syllabus sections
            </Button>
          </div>
          {selectedExams.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold text-slate-600">Discover and select at least one exam first.</p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {selectedExams.map((exam) => (
                <ExamGuide key={examKey(exam)} exam={exam} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeStep === "subjects" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-2xl font-black">Prioritize every detailed syllabus section</h3>
            <p className="mt-1 text-sm text-slate-500">Set priority for each detailed syllabus section, then the planner will schedule its topics.</p>
          </div>
          <div className="space-y-3">
            {setup.subjectPreferences.map((subject, index) => (
              <Card key={subject.id} className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{subject.examName}</span>
                    <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">{subject.phase}</span>
                    <h4 className="text-lg font-black">{subject.name}</h4>
                    {subject.favorite && <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Favorite</span>}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{subject.topics.join(", ")}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[auto_auto_auto] lg:min-w-[420px]">
                  <div className="flex gap-2">
                    <Button variant="secondary" aria-label="Move subject up" onClick={() => moveSubject(index, -1)} disabled={index === 0}>
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button variant="secondary" aria-label="Move subject down" onClick={() => moveSubject(index, 1)} disabled={index === setup.subjectPreferences.length - 1}>
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <select
                    className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold"
                    value={subject.priority}
                    onChange={(event) => updateSubject(subject.id, { priority: event.target.value as Priority })}
                  >
                    <option value="High">High priority</option>
                    <option value="Medium">Medium priority</option>
                    <option value="Low">Low priority</option>
                  </select>
                  <Button variant={subject.favorite ? "primary" : "secondary"} onClick={() => updateSubject(subject.id, { favorite: !subject.favorite })}>
                    {subject.favorite ? "Favorited" : "Favorite"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <Button disabled={setup.subjectPreferences.length === 0} onClick={() => unlockAndGo("time")}>
            Set study time
          </Button>
        </div>
      )}

      {activeStep === "time" && (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="space-y-4">
            <CalendarDays className="size-7 text-brand" aria-hidden />
            <div>
              <h3 className="text-2xl font-black">How much time can you give?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">The planner spreads study tasks across your limits and schedules a daily quiz time.</p>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-bold">Preparation start date</span>
              <Input
                type="date"
                min={todayIso()}
                value={setup.startDate || todayIso()}
                onChange={(event) => setSetup((current) => ({ ...current, startDate: event.target.value, plan: removeSelectedExamPlan(current.plan, current.subjectPreferences) }))}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-bold">Daily study hours</span>
              <Input
                type="number"
                min={0.5}
                max={16}
                step={0.5}
                value={setup.dailyHours}
                onChange={(event) => setSetup((current) => ({ ...current, dailyHours: Number(event.target.value), plan: removeSelectedExamPlan(current.plan, current.subjectPreferences) }))}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-bold">Weekly study hours</span>
              <Input
                type="number"
                min={1}
                max={100}
                step={1}
                value={setup.weeklyHours}
                onChange={(event) => setSetup((current) => ({ ...current, weeklyHours: Number(event.target.value), plan: removeSelectedExamPlan(current.plan, current.subjectPreferences) }))}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-bold">Daily quiz scheduling time</span>
              <Input
                type="time"
                value={setup.quizTime}
                onChange={(event) => setSetup((current) => ({ ...current, quizTime: event.target.value }))}
              />
            </label>
            <Button onClick={createPlan} disabled={setup.subjectPreferences.length === 0 || setup.dailyHours <= 0}>
              <Plus className="size-4" aria-hidden />
              Generate dated plan
            </Button>
          </Card>
          <Card>
            <h4 className="text-lg font-black">Plan logic</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Daily load" value="1 task/day" />
              <Metric label="Big topics" value="4-28 days" />
              <Metric label="Revision" value="Built in" />
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-500">
              The app breaks large topics into concepts, basic practice, advanced practice, PYQs, speed work, and revision tests before moving ahead.
            </p>
          </Card>
        </div>
      )}

      {activeStep === "plan" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black">Dated task plan</h3>
              <p className="mt-1 text-sm text-slate-500">
                Starts from today and spreads topics according to your daily and weekly study time.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={createPlan}>
                Regenerate
              </Button>
              <Button variant="secondary" onClick={appendLeftoverTasks} disabled={setup.plan.every((task) => task.done) || setup.plan.length === 0}>
                Carry forward left tasks
              </Button>
              <Button variant={isPlanEditing ? "primary" : "secondary"} onClick={() => setIsPlanEditing((current) => !current)} disabled={setup.plan.length === 0}>
                <Pencil className="size-4" aria-hidden />
                {isPlanEditing ? "Done editing" : "Edit plan"}
              </Button>
              <Button onClick={() => void setPlanAndOpenPlanner()} disabled={setup.plan.length === 0 || isPlanEditing}>
                Set this plan
              </Button>
            </div>
          </div>
          {setup.plan.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold text-slate-600">Generate your plan from the time step first.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {setup.plan.map((task) => (
                <Card key={task.id} className="grid gap-3 lg:grid-cols-[140px_1fr_130px_auto] lg:items-center">
                  {isPlanEditing ? (
                    <>
                      <Input type="date" value={task.date} onChange={(event) => updateTask(task.id, { date: event.target.value })} />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Input value={task.examName} onChange={(event) => updateTask(task.id, { examName: event.target.value })} aria-label="Exam name" />
                        <Input value={task.subject} onChange={(event) => updateTask(task.id, { subject: event.target.value })} aria-label="Subject" />
                        <Input value={task.topic} onChange={(event) => updateTask(task.id, { topic: event.target.value })} aria-label="Topic" />
                      </div>
                      <Input
                        type="number"
                        min={0.25}
                        step={0.25}
                        value={task.durationHours}
                        onChange={(event) => updateTask(task.id, { durationHours: Number(event.target.value) })}
                        aria-label="Duration hours"
                      />
                      <Button variant="ghost" onClick={() => removeTask(task.id)} aria-label="Delete task">
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{task.date}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{task.topic}</p>
                        <p className="truncate text-xs font-semibold text-slate-500">
                          {task.examName} / {task.subject}
                        </p>
                      </div>
                      <div className="rounded-md bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-900">{task.durationHours} hrs</div>
                      <span className="hidden lg:block" aria-hidden />
                    </>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};

const DetailList = ({ title, items }: { title: string; items: string[] }) => (
  <div>
    <p className="text-sm font-black">{title}</p>
    <div className="mt-2 grid gap-2">
      {items.length === 0 ? (
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">No data returned yet.</div>
      ) : (
        items.map((item) => (
          <div key={item} className="flex gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>{item}</span>
          </div>
        ))
      )}
    </div>
  </div>
);

const ExamGuide = ({ exam }: { exam: DynamicExam }) => {
  const subjects = safeArray(exam.subjects);
  const rawSyllabusSections = safeArray(exam.syllabusSections);
  const rawPhaseDetails = safeArray(exam.phaseDetails);
  const detailedSyllabus = safeArray(exam.detailedSyllabus).map((phase) => ({
    phase: phase.phase,
    sections: safeArray(phase.sections).map((section) => ({
      title: section.title,
      topics: safeArray(section.topics)
    }))
  }));
  const syllabusSections =
    rawSyllabusSections.length > 0
      ? rawSyllabusSections.map((section) => ({
          title: section.title,
          topics: safeArray(section.topics).map((topic) =>
            typeof topic === "string"
              ? { name: topic, subtopics: [] }
              : {
                  name: topic.name,
                  subtopics: safeArray(topic.subtopics)
                }
          )
        }))
      : subjects.map((subject) => ({
          title: subject.name,
          topics: safeArray(subject.topics).map((topic) => ({
            name: topic.name,
            subtopics: safeArray(topic.subtopics).map((subtopic) => subtopic.name)
          }))
        }));
  const phaseDetails =
    rawPhaseDetails.length > 0
      ? rawPhaseDetails.map((phase) => ({
          ...phase,
          subjects: safeArray(phase.subjects),
          description: safeArray(phase.description)
        }))
      : [
          {
            title: "Exam Pattern",
            mode: "",
            duration: "",
            totalQuestions: "",
            totalMarks: "",
            negativeMarking: "",
            subjects: [],
            description: safeArray(exam.examPattern)
          }
        ];
  const prepTime = exam.timeline || `${exam.suggestedStudyDurationWeeks || 24} weeks recommended preparation`;

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
      <div className="bg-ink p-4 text-white sm:p-6">
        <p className="text-sm font-semibold text-cyan-200">Complete Guide</p>
        <h4 className="mt-2 break-words text-xl font-black leading-tight sm:text-3xl">COMPLETE GUIDE - {exam.examName}</h4>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/75">{exam.overview}</p>
      </div>

      <div className="grid gap-4 p-3 sm:p-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3 sm:space-y-5">
          <GuideSection icon={"\u{1F3DB}\u{FE0F}"} title={`What is ${shortExamName(exam.examName)}?`}>
            <GuideParagraph value={exam.overview || exam.purpose} />
          </GuideSection>

          <GuideSection icon={"\u{1F468}\u{200D}\u{1F4BC}"} title="Post Name">
            <GuideParagraph value={exam.postName || exam.examName} emphasis />
            <GuideParagraph value={exam.purpose} />
          </GuideSection>

          <GuideSection icon={"\u{1F393}"} title="Eligibility">
            <GuideBullets items={exam.eligibility} />
          </GuideSection>

          <GuideSection icon={"\u{1F331}"} title="Detailed Syllabus">
            <GuideParagraph value={exam.syllabusSummary} />
            <div className="mt-4 space-y-4">
              {(detailedSyllabus.length > 0 ? detailedSyllabus : fallbackDetailedSyllabus(syllabusSections)).map((phase) => (
                <div key={phase.phase} className="rounded-lg border border-slate-200 p-4">
                  <h6 className="text-lg font-black">{phase.phase}</h6>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {phase.sections.map((section) => (
                      <div key={`${phase.phase}-${section.title}`} className="rounded-md bg-slate-50 p-3">
                        <p className="font-black text-slate-800">{section.title}</p>
                        <GuideBullets items={section.topics} compact />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </GuideSection>

          <GuideSection icon={"\u{1F4DD}"} title="Selection Process">
            <GuideNumbered items={safeArray(exam.selectionProcess).length > 0 ? safeArray(exam.selectionProcess) : safeArray(exam.examPattern)} />
          </GuideSection>

          {phaseDetails.map((phase) => (
            <GuideSection key={phase.title} icon={phaseIcon(phase.title)} title={phase.title}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <GuideMeta label="Mode" value={phase.mode} />
                <GuideMeta label="Duration" value={phase.duration} />
                <GuideMeta label="Total Questions" value={phase.totalQuestions} />
                <GuideMeta label="Total Marks" value={phase.totalMarks} />
                <GuideMeta label="Negative Marking" value={phase.negativeMarking} wide />
              </div>
              {phase.subjects.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
                  <div className="min-w-[420px]">
                    <div className="grid grid-cols-[1fr_82px_82px] bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500 sm:grid-cols-[1fr_96px_96px]">
                      <span>Subject</span>
                      <span>Marks</span>
                      <span>Questions</span>
                    </div>
                    {phase.subjects.map((subject) => (
                      <div key={`${phase.title}-${subject.name}`} className="grid grid-cols-[1fr_82px_82px] border-t border-slate-200 px-3 py-2 text-sm sm:grid-cols-[1fr_96px_96px]">
                        <span className="truncate font-semibold">{subject.name}</span>
                        <span>{subject.marks || "-"}</span>
                        <span>{subject.questions || "-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <GuideBullets items={phase.description} />
            </GuideSection>
          ))}



          <GuideSection icon={"\u{1F3A4}"} title="Interview">
            <GuideBullets items={safeArray(exam.interviewDetails)} fallback={["Interview details will depend on the latest official notification."]} />
          </GuideSection>

          <GuideSection icon={"\u{1F4B0}"} title="Salary">
            <GuideParagraph value={exam.salary} />
            <GuideParagraph value={exam.annualCtc} emphasis />
            <GuideBullets items={safeArray(exam.perks)} />
          </GuideSection>

          <GuideSection icon={"\u{1F4BC}"} title="Job Profile">
            <GuideBullets items={splitToUsefulBullets(exam.workProfile)} fallback={[exam.workProfile]} />
          </GuideSection>

          <GuideSection icon={"\u{1F4CD}"} title="Posting">
            <GuideBullets items={safeArray(exam.posting).length > 0 ? safeArray(exam.posting) : safeArray(exam.departments)} />
          </GuideSection>

          <GuideSection icon={"\u{1F4DA}"} title="Best Books">
            <div className="grid gap-3 md:grid-cols-2">
              {safeArray(exam.bestBooks).length > 0 ? (
                safeArray(exam.bestBooks).map((group) => (
                  <div key={group.subject} className="rounded-md border border-slate-200 p-4">
                    <p className="font-black">{group.subject}</p>
                    <GuideBullets items={safeArray(group.books)} compact />
                  </div>
                ))
              ) : (
                <GuideBullets items={["Use standard books, official syllabus, previous papers, current affairs, and official reports."]} />
              )}
            </div>
          </GuideSection>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Preparation Time</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{prepTime}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-black">Why Choose This Exam?</p>
            <GuideBullets items={safeArray(exam.whyChooseExam)} fallback={["Strong career path", "Recognized exam outcome", "Long-term growth potential"]} compact />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-black">Preparation Order</p>
            <GuideNumbered items={safeArray(exam.recommendedPreparationOrder)} compact />
          </div>
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-sm font-black text-cyan-950">High-Priority Topics</p>
            <GuideNumbered items={safeArray(exam.highPriorityTopics)} compact />
          </div>
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-sm font-black text-cyan-950">Preparation Tips</p>
            <GuideBullets items={safeArray(exam.preparationTips)} fallback={safeArray(exam.importantConcepts)} compact />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-400">Source confidence</p>
            <p className="mt-1 text-2xl font-black">{Math.round(exam.sourceConfidence * 100)}%</p>
          </div>
        </aside>
      </div>
    </article>
  );
};

const GuideSection = ({ children, icon, title }: { children: ReactNode; icon: string; title: string }) => (
  <section className="overflow-hidden rounded-lg border border-slate-200 p-3 sm:p-5">
    <h5 className="flex min-w-0 items-start gap-2 break-words text-lg font-black leading-snug sm:text-xl">
      <span className="shrink-0" aria-hidden>{icon}</span>
      {title}
    </h5>
    <div className="mt-3">{children}</div>
  </section>
);

const GuideParagraph = ({ emphasis = false, value }: { emphasis?: boolean; value: string }) =>
  value ? <p className={`${emphasis ? "font-bold text-ink" : "text-slate-600"} break-words text-sm leading-6`}>{value}</p> : null;

const GuideBullets = ({ compact = false, fallback = [], items }: { compact?: boolean; fallback?: string[]; items: string[] }) => {
  const list = items.length > 0 ? items : fallback;
  if (list.length === 0) return <p className="text-sm text-slate-500">Details will be refined after the latest official notification.</p>;

  return (
    <ul className={`${compact ? "mt-2" : "mt-3"} space-y-2`}>
      {list.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-6 text-slate-600">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
};

const GuideNumbered = ({ compact = false, items }: { compact?: boolean; items: string[] }) => {
  if (items.length === 0) return <p className="text-sm text-slate-500">Preparation order will be refined after discovery.</p>;

  return (
    <ol className={`${compact ? "mt-2" : "mt-3"} space-y-2`}>
      {items.map((item, index) => (
        <li key={item} className="flex gap-2 text-sm leading-6 text-slate-600">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink text-xs font-black text-white">{index + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
};

const GuideMeta = ({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) =>
  value ? (
    <div className={`rounded-md bg-slate-50 p-3 ${wide ? "sm:col-span-2 xl:col-span-3" : ""}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{value}</p>
    </div>
  ) : null;

const shortExamName = (name: string) => name.split("(")[0]?.trim() || name;
const phaseIcon = (title: string) => {
  const lower = title.toLowerCase();
  if (lower.includes("interview")) return "\u{1F3A4}";
  if (lower.includes("main")) return "\u{1F4D6}";
  if (lower.includes("pre")) return "\u{1F4DA}";
  return "\u{1F4DD}";
};

const splitToUsefulBullets = (value: string) =>
  value
    .split(/\.|;|\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 8);

const fallbackDetailedSyllabus = (sections: Array<{ title: string; topics: Array<{ name: string; subtopics: string[] }> }>) =>
  sections.map((section) => ({
    phase: section.title,
    sections: section.topics.map((topic) => ({
      title: topic.name,
      topics: topic.subtopics
    }))
  }));

const InfoBlock = ({ title, value }: { title: string; value: string }) => (
  <div className="rounded-md border border-slate-200 p-3">
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
    <p className="mt-2 text-sm leading-6 text-slate-700">{value || "No data returned yet."}</p>
  </div>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-slate-200 bg-white p-4">
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 text-lg font-black">{value}</p>
  </div>
);

const MetricDark = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-white/10 bg-white/10 p-4">
    <p className="text-xs text-white/60">{label}</p>
    <p className="mt-2 text-2xl font-black">{value}</p>
  </div>
);

const MetricDarkCompact = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/10 px-3 py-2">
    <span className="text-xs font-semibold text-white/60">{label}</span>
    <span className="text-lg font-black">{value}</span>
  </div>
);
