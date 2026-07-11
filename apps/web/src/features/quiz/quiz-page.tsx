import type { ExamDiscoveryResult, QuizQuestion } from "@ai-quiz-coach/shared";
import { Link } from "@tanstack/react-router";
import axios from "axios";
import { Bookmark, BookOpenCheck, CalendarClock, ChevronLeft, ChevronRight, Clock3, Flag, History, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { formatDisplayDate, formatDisplayTime } from "../../utils/format";

type DynamicExam = ExamDiscoveryResult & { id?: string };

interface SavedSetup {
  completedTopics?: string[];
  discoveredExams?: DynamicExam[];
  selectedExamIds?: string[];
  activeExamId?: string;
  plan?: StudyTask[];
  quizTime?: string;
  quizHistory?: QuizHistoryItem[];
  preGeneratedQuiz?: PreGeneratedQuiz;
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

interface QuizHistoryItem {
  id: string;
  date: string;
  time: string;
  examName: string;
  subject: string;
  topic: string;
  status: string;
  score?: number;
  totalQuestions?: number;
  accuracy?: number;
  questions?: QuizQuestion[];
  answers?: AnswerRecord[];
  pattern?: QuizPattern;
}

interface QuizPattern {
  questionCount: number;
  durationMinutes: number;
  totalMarks: number;
  negativeMarks: number;
  label: string;
}

interface AnswerRecord {
  questionId: string;
  answer: string;
}

interface PreGeneratedQuiz {
  key: string;
  date: string;
  time: string;
  questions: QuizQuestion[];
  pattern: QuizPattern;
  generatedAt: string;
}

const todayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatInputTime = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const parseLocalDateTime = (date: string, time: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1, hour || 0, minute || 0);
};

const minimumScheduleDateTime = () => {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 5, 0, 0);
  return next;
};

const quizKey = (task: StudyTask | null, quizTime: string, pattern: QuizPattern) =>
  task ? `${task.id}:${task.date}:${quizTime}:${pattern.questionCount}:${pattern.label}` : "";

const examKey = (exam: DynamicExam) => exam.id ?? exam.examName.trim().toLowerCase();

const parseSetup = (setup: SavedSetup) => {
  const exams = setup.discoveredExams ?? [];
  const activeExam = exams.find((exam) => examKey(exam) === setup.activeExamId) ?? exams.find((exam) => (setup.selectedExamIds ?? []).includes(examKey(exam)));
  return {
    exams,
    activeExam,
    plan: (setup.plan ?? []).filter((task) => !activeExam || task.examName === activeExam.examName),
    quizTime: setup.quizTime ?? "19:30",
    history: (setup.quizHistory ?? []).filter((item) => !activeExam || item.examName === activeExam.examName),
    preGeneratedQuiz: setup.preGeneratedQuiz
  };
};

const mergeHistoryById = (allHistory: QuizHistoryItem[], activeHistory: QuizHistoryItem[]) => {
  const activeIds = new Set(activeHistory.map((item) => item.id));
  return [...activeHistory, ...allHistory.filter((item) => !activeIds.has(item.id))].slice(0, 50);
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string; error?: { message?: string } } | undefined)?.message;
    const nested = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    return message ?? nested ?? error.message;
  }
  return error instanceof Error ? error.message : "Unable to generate quiz questions.";
};

const findExam = (exams: DynamicExam[], examName: string) => exams.find((exam) => exam.examName === examName);

const numberFromText = (value: string | undefined, fallback: number) => {
  const match = value?.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
};

const normalizedTokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !["and", "the", "exam", "quiz"].includes(token));

const deriveQuizPattern = (exam: DynamicExam | undefined, scheduledSubject: string): QuizPattern => {
  const fallback = { questionCount: 20, durationMinutes: 20, totalMarks: 20, negativeMarks: 0.25, label: "Adaptive scheduled quiz" };
  if (!exam) return fallback;

  const phases = exam.phaseDetails ?? [];
  const objectivePhase = phases.find((phase) => phase.subjects?.length > 0 && /pre|phase i|objective/i.test(phase.title)) ?? phases.find((phase) => phase.subjects?.length > 0);
  if (!objectivePhase) return fallback;

  const subjectTokens = normalizedTokens(scheduledSubject);
  const matchedSubjects = (objectivePhase.subjects ?? []).filter((subject) => {
    const nameTokens = normalizedTokens(subject.name);
    return subjectTokens.some((token) => nameTokens.includes(token)) || nameTokens.some((token) => subjectTokens.includes(token));
  });
  const subjectsToUse = matchedSubjects.length > 0 ? matchedSubjects : objectivePhase.subjects ?? [];
  const phaseQuestions = numberFromText(objectivePhase.totalQuestions, 0) || subjectsToUse.reduce((total, subject) => total + numberFromText(subject.questions || subject.marks, 0), 0) || fallback.questionCount;
  const phaseMinutes = numberFromText(objectivePhase.duration, fallback.durationMinutes);
  const questionCount = subjectsToUse.reduce((total, subject) => total + numberFromText(subject.questions || subject.marks, 0), 0) || phaseQuestions;
  const totalMarks = subjectsToUse.reduce((total, subject) => total + numberFromText(subject.marks || subject.questions, 0), 0) || questionCount;
  const durationMinutes = Math.max(1, Math.round((phaseMinutes * questionCount) / Math.max(phaseQuestions, questionCount)));
  const negativeMarks = numberFromText(objectivePhase.negativeMarking, fallback.negativeMarks);

  return {
    questionCount,
    durationMinutes,
    totalMarks,
    negativeMarks,
    label: `${objectivePhase.title}${matchedSubjects.length > 0 ? `: ${subjectsToUse.map((subject) => subject.name).join(" + ")}` : ""}`
  };
};

const normalizeAnswerValue = (value: unknown) => String(value ?? "").trim().toLowerCase();

const optionPrefix = (value: unknown) => normalizeAnswerValue(value).match(/^([a-z0-9]+)[).:\-\s]/)?.[1] ?? "";

const answerVariants = (question: QuizQuestion, answer: unknown): string[] => {
  if (Array.isArray(answer)) return answer.flatMap((item) => answerVariants(question, item));
  if (typeof answer === "object" && answer !== null) return [normalizeAnswerValue(JSON.stringify(answer))];

  const raw = String(answer ?? "").trim();
  if (!raw) return [];

  const rawValue = normalizeAnswerValue(raw);
  const matchedOption = (question.options ?? []).find((item) =>
    [item.id, item.label, item.value].some((value) => {
      const normalized = normalizeAnswerValue(value);
      return normalized === rawValue || optionPrefix(value) === rawValue || normalized === optionPrefix(raw);
    })
  );

  const values = matchedOption ? [matchedOption.id, matchedOption.label, matchedOption.value, raw] : [raw];
  return [...new Set(values.map(normalizeAnswerValue).filter(Boolean))];
};

const isCorrectAnswer = (question: QuizQuestion, answer: string) => {
  const selectedVariants = answerVariants(question, answer);
  if (Array.isArray(question.correctAnswer) && question.correctAnswer.length > 1) {
    return question.correctAnswer.every((item) =>
      answerVariants(question, item).some((variant) => selectedVariants.includes(variant))
    );
  }

  const correctVariants = answerVariants(question, question.correctAnswer);
  return selectedVariants.some((variant) => correctVariants.includes(variant));
};

const resolveAnswerText = (question: QuizQuestion, answer: unknown): string => {
  if (Array.isArray(answer)) {
    return answer.map((item) => resolveAnswerText(question, item)).join(", ");
  }
  if (typeof answer === "object" && answer !== null) {
    return JSON.stringify(answer);
  }
  const raw = String(answer ?? "").trim();
  const option = (question.options ?? []).find((item) =>
    [item.id, item.label, item.value].some((value) => {
      const normalized = normalizeAnswerValue(value);
      return normalized === normalizeAnswerValue(raw) || optionPrefix(value) === normalizeAnswerValue(raw);
    })
  );
  return option?.value ?? raw;
};

const calculateSummary = (questions: QuizQuestion[], answers: AnswerRecord[]) => {
  const attempted = answers.filter((answer) => answer.answer.trim().length > 0);
  const correct = attempted.filter((answer) => {
    const question = questions.find((item) => item.id === answer.questionId);
    return question ? isCorrectAnswer(question, answer.answer) : false;
  });
  const score = attempted.reduce((total, answer) => {
    const question = questions.find((item) => item.id === answer.questionId);
    if (!question) return total;
    return total + (isCorrectAnswer(question, answer.answer) ? question.marks : -(question.negativeMarks ?? 0));
  }, 0);
  const topicStats = new Map<string, { topic: string; attempted: number; correct: number; total: number }>();
  for (const question of questions) {
    const topic = question.subtopic || question.topic || "General";
    const bucket = topicStats.get(topic) ?? { topic, attempted: 0, correct: 0, total: 0 };
    const answer = answers.find((item) => item.questionId === question.id);
    bucket.total += 1;
    if (answer?.answer.trim()) {
      bucket.attempted += 1;
      if (isCorrectAnswer(question, answer.answer)) bucket.correct += 1;
    }
    topicStats.set(topic, bucket);
  }
  const topicPerformance = [...topicStats.values()].map((topic) => ({
    ...topic,
    accuracy: topic.attempted > 0 ? Math.round((topic.correct / topic.attempted) * 100) : 0
  }));

  return {
    attempted: attempted.length,
    correct: correct.length,
    wrong: attempted.length - correct.length,
    skipped: Math.max(questions.length - attempted.length, 0),
    score: Number(score.toFixed(2)),
    accuracy: attempted.length > 0 ? Math.round((correct.length / attempted.length) * 100) : 0,
    topicPerformance,
    weakTopics: topicPerformance.filter((topic) => topic.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5),
    strongTopics: topicPerformance.filter((topic) => topic.accuracy >= 75).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5)
  };
};

export const QuizPage = () => {
  const [confirmed, setConfirmed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [preparedQuiz, setPreparedQuiz] = useState<PreGeneratedQuiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState("");
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [isScheduleEditing, setIsScheduleEditing] = useState(false);
  const [draftQuizTime, setDraftQuizTime] = useState("19:30");
  const [clock, setClock] = useState(new Date());
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [generationAttemptedKey, setGenerationAttemptedKey] = useState("");
  const [rawSetup, setRawSetup] = useState<SavedSetup>({});
  const [setup, setSetup] = useState<{ exams: DynamicExam[]; activeExam?: DynamicExam; plan: StudyTask[]; quizTime: string; history: QuizHistoryItem[]; preGeneratedQuiz?: PreGeneratedQuiz }>({
    exams: [],
    plan: [],
    quizTime: "19:30",
    history: []
  });
  const [isLoadingSetup, setIsLoadingSetup] = useState(true);
  const activeQuestion = questions[currentQuestionIndex];

  useEffect(() => {
    let mounted = true;

    const loadSetup = async () => {
      try {
        window.localStorage.removeItem("sk-quiz-coach-onboarding-v3");
        const response = await apiClient.get<{ data: SavedSetup }>("/onboarding/state");
        if (mounted) {
          setRawSetup(response.data.data);
          const parsed = parseSetup(response.data.data);
          setSetup(parsed);
          setDraftQuizTime(parsed.quizTime);
          setPreparedQuiz(parsed.preGeneratedQuiz ?? null);
        }
      } catch {
        if (mounted) setSetup({ exams: [], plan: [], quizTime: "19:30", history: [] });
      } finally {
        if (mounted) setIsLoadingSetup(false);
      }
    };

    void loadSetup();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const upcomingQuiz = useMemo(() => {
    const today = todayIso();
    const pending = setup.plan.filter((task) => !task.done);
    return pending.find((task) => task.date >= today) ?? pending[0] ?? null;
  }, [setup.plan]);

  const firstGroup = useMemo(() => {
    if (!upcomingQuiz) return null;
    return {
      examName: upcomingQuiz.examName,
      subject: upcomingQuiz.subject,
      topics: [upcomingQuiz.topic]
    };
  }, [upcomingQuiz]);
  const exam = useMemo(() => setup.activeExam ?? findExam(setup.exams, firstGroup?.examName ?? ""), [firstGroup?.examName, setup.activeExam, setup.exams]);
  const quizPattern = useMemo(() => deriveQuizPattern(exam, firstGroup?.subject ?? upcomingQuiz?.subject ?? ""), [exam, firstGroup?.subject, upcomingQuiz?.subject]);
  const currentQuizKey = useMemo(() => quizKey(upcomingQuiz, setup.quizTime, quizPattern), [quizPattern, setup.quizTime, upcomingQuiz]);
  const scheduledAt = useMemo(() => (upcomingQuiz ? parseLocalDateTime(upcomingQuiz.date, setup.quizTime) : null), [setup.quizTime, upcomingQuiz]);
  const generateAfter = useMemo(() => {
    if (!scheduledAt) return null;
    const date = new Date(scheduledAt);
    date.setMinutes(date.getMinutes() - 5);
    return date;
  }, [scheduledAt]);
  const now = clock;
  const canGenerateInAdvance = Boolean(generateAfter && now >= generateAfter);
  const canStartScheduledQuiz = Boolean(scheduledAt && now >= scheduledAt);
  const isPreparedForCurrentQuiz = Boolean(preparedQuiz && preparedQuiz.key === currentQuizKey && preparedQuiz.questions.length > 0);
  const minSchedule = minimumScheduleDateTime();
  const draftScheduleAt = upcomingQuiz ? parseLocalDateTime(upcomingQuiz.date, draftQuizTime) : null;
  const isDraftScheduleValid = Boolean(draftScheduleAt && draftScheduleAt >= minSchedule);
  const summary = useMemo(() => calculateSummary(questions, answers), [answers, questions]);
  const selectedHistory = useMemo(() => setup.history.find((item) => item.id === selectedHistoryId), [selectedHistoryId, setup.history]);

  const finishQuiz = useCallback((finalAnswers: AnswerRecord[]) => {
    const finalSummary = calculateSummary(questions, finalAnswers);
    setAnswers(finalAnswers);
    setRemainingSeconds(0);
    setIsFinished(true);
    setSetup((current) => {
      const activeHistoryItem = current.history.find((item) => item.id === currentQuizKey);
      const rest = current.history.filter((item) => item.id !== currentQuizKey);
      const completedItem: QuizHistoryItem = {
        ...(activeHistoryItem ?? {
          id: currentQuizKey,
          date: upcomingQuiz?.date ?? todayIso(),
          time: setup.quizTime,
          examName: firstGroup?.examName ?? "",
          subject: firstGroup?.subject ?? "",
          topic: firstGroup?.topics[0] ?? "Scheduled quiz"
        }),
        status: "Completed",
        score: finalSummary.score,
        totalQuestions: questions.length,
        accuracy: finalSummary.accuracy,
        questions,
        answers: finalAnswers,
        pattern: quizPattern
      };
      const nextPlan = current.plan.map((task) => task.id === upcomingQuiz?.id ? { ...task, done: true } : task);
      const nextRawPlan = (rawSetup.plan ?? []).map((task) => task.id === upcomingQuiz?.id ? { ...task, done: true } : task);
      const completedHistory = [completedItem, ...rest].slice(0, 20);
      const nextRawHistory = mergeHistoryById(rawSetup.quizHistory ?? [], completedHistory);
      void apiClient.put("/onboarding/state", { state: { ...rawSetup, plan: nextRawPlan, quizHistory: nextRawHistory } });
      setRawSetup((saved) => ({ ...saved, plan: nextRawPlan, quizHistory: nextRawHistory }));
      return { ...current, plan: nextPlan, history: completedHistory };
    });
  }, [currentQuizKey, firstGroup, questions, quizPattern, rawSetup, setup.quizTime, upcomingQuiz?.date, upcomingQuiz?.id]);

  const preGenerateQuestions = async () => {
    if (!firstGroup) return null;

    setIsGenerating(true);
    setErrorMessage("");

    try {
      const response = await apiClient.post<{ data: { questions: QuizQuestion[]; promptVersion: string } }>("/quizzes/generate", {
        examName: firstGroup.examName,
        subject: firstGroup.subject,
        topics: firstGroup.topics,
        difficulty: "adaptive",
        questionCount: quizPattern.questionCount,
        markingStructure: exam?.markingStructure ?? []
      }, { timeout: 300_000 });
      const generated: PreGeneratedQuiz = {
        key: currentQuizKey,
        date: upcomingQuiz?.date ?? todayIso(),
        time: setup.quizTime,
        questions: response.data.data.questions,
        pattern: quizPattern,
        generatedAt: new Date().toISOString()
      };
      setPreparedQuiz(generated);
      setSetup((current) => ({ ...current, preGeneratedQuiz: generated }));
      setRawSetup((current) => ({ ...current, preGeneratedQuiz: generated }));
      await apiClient.put("/onboarding/state", { state: { ...rawSetup, preGeneratedQuiz: generated } });
      return generated;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const startPreparedQuiz = async (quizOverride?: PreGeneratedQuiz | null) => {
    const quizToStart = quizOverride ?? preparedQuiz;
    if (!firstGroup || !upcomingQuiz || !quizToStart || quizToStart.key !== currentQuizKey) return;
    if (!canStartScheduledQuiz) {
      setErrorMessage("This quiz can start only at the scheduled time in your local timezone.");
      return;
    }

    setQuestions(quizToStart.questions);
    setAnswers([]);
    setCurrentQuestionIndex(0);
    setSelectedOption("");
    setIsFinished(false);
    setConfirmed(true);
    setRemainingSeconds(Math.max(60, quizToStart.pattern.durationMinutes * 60));

    const alreadyStarted = setup.history.some((item) => item.id === quizToStart.key && item.status === "Started");
    if (!alreadyStarted) {
      const historyItem: QuizHistoryItem = {
        id: quizToStart.key,
        date: upcomingQuiz.date,
        time: setup.quizTime,
        examName: firstGroup.examName,
        subject: firstGroup.subject,
        topic: firstGroup.topics[0] ?? "Scheduled quiz",
        status: "Started",
        totalQuestions: quizToStart.questions.length
      };
      const nextHistory = [historyItem, ...setup.history].slice(0, 20);
      const nextRawHistory = mergeHistoryById(rawSetup.quizHistory ?? [], nextHistory);
      setSetup((current) => ({ ...current, history: nextHistory }));
      setRawSetup((current) => ({ ...current, quizHistory: nextRawHistory }));
      await apiClient.put("/onboarding/state", { state: { ...rawSetup, quizHistory: nextRawHistory } });
    }
  };

  const startScheduledQuiz = async () => {
    if (!canStartScheduledQuiz) {
      setErrorMessage("This quiz can start only at the scheduled time in your local timezone.");
      return;
    }
    if (isPreparedForCurrentQuiz) {
      await startPreparedQuiz();
      return;
    }
    const generated = await preGenerateQuestions();
    if (generated) await startPreparedQuiz(generated);
  };

  const saveScheduleTime = async () => {
    if (!isDraftScheduleValid) {
      setErrorMessage(`Choose a quiz time at least 5 minutes from now. Earliest allowed time is ${formatDisplayTime(minSchedule)}.`);
      return;
    }
    const nextState = { ...rawSetup, quizTime: draftQuizTime, preGeneratedQuiz: undefined };
    setRawSetup(nextState);
    setSetup((current) => ({ ...current, quizTime: draftQuizTime, preGeneratedQuiz: undefined }));
    setPreparedQuiz(null);
    setGenerationAttemptedKey("");
    setIsScheduleEditing(false);
    setErrorMessage("");
    await apiClient.put("/onboarding/state", { state: nextState });
  };

  useEffect(() => {
    if (!firstGroup || !canGenerateInAdvance || isPreparedForCurrentQuiz || isGenerating || generationAttemptedKey === currentQuizKey) return;
    setGenerationAttemptedKey(currentQuizKey);
    void preGenerateQuestions();
  }, [canGenerateInAdvance, currentQuizKey, firstGroup, generationAttemptedKey, isGenerating, isPreparedForCurrentQuiz]);

  useEffect(() => {
    if (!confirmed || isFinished || questions.length === 0 || remainingSeconds <= 0) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [confirmed, isFinished, questions.length, remainingSeconds]);

  useEffect(() => {
    if (!confirmed || isFinished || questions.length === 0 || remainingSeconds !== 0) return;
    finishQuiz(withCurrentAnswer(answers));
  }, [answers, confirmed, finishQuiz, isFinished, questions.length, remainingSeconds]);

  const withCurrentAnswer = (current: AnswerRecord[]) => {
    if (!activeQuestion) return current;
    const withoutCurrent = current.filter((answer) => answer.questionId !== activeQuestion.id);
    return [...withoutCurrent, { questionId: activeQuestion.id, answer: selectedOption }];
  };

  const saveCurrentAnswer = () => {
    setAnswers((current) => withCurrentAnswer(current));
  };

  const goToQuestion = (nextIndex: number) => {
    const answer = activeQuestion ? answers.find((item) => item.questionId === activeQuestion.id)?.answer : "";
    const nextQuestionItem = questions[nextIndex];
    setCurrentQuestionIndex(nextIndex);
    setSelectedOption(nextQuestionItem ? answers.find((item) => item.questionId === nextQuestionItem.id)?.answer ?? "" : answer ?? "");
  };

  const nextQuestion = () => {
    const finalAnswers = withCurrentAnswer(answers);
    setAnswers(finalAnswers);
    if (currentQuestionIndex >= questions.length - 1) {
      finishQuiz(finalAnswers);
      return;
    }
    goToQuestion(currentQuestionIndex + 1);
  };

  const previousQuestion = () => {
    saveCurrentAnswer();
    if (currentQuestionIndex > 0) goToQuestion(currentQuestionIndex - 1);
  };

  if (isLoadingSetup) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="space-y-4">
          <BookOpenCheck className="size-8 text-brand" aria-hidden />
          <h2 className="text-2xl font-black">Loading quiz setup</h2>
          <p className="text-sm leading-6 text-slate-500">Fetching prepared topics from the database.</p>
        </Card>
      </div>
    );
  }

  if (setup.plan.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="space-y-4">
          <BookOpenCheck className="size-8 text-brand" aria-hidden />
          <div>
            <h2 className="text-2xl font-black">Schedule your quiz plan first</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              No daily quiz schedule is saved yet. Finish onboarding, choose your daily quiz time, and set your plan.
            </p>
          </div>
          <Link to="/onboarding" className="inline-flex min-h-10 items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white shadow-soft">
            Go to setup
          </Link>
        </Card>
      </div>
    );
  }

  if (!confirmed) {
    return (
      <div className="mx-auto max-w-7xl space-y-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <Card className="space-y-3 p-3 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CalendarClock className="size-6 text-brand" aria-hidden />
                <div>
                  <h2 className="text-lg font-black sm:text-xl">Upcoming scheduled quiz</h2>
                  <p className="text-sm text-slate-500">Local time based daily quiz.</p>
                </div>
              </div>
              <span className={`rounded-md px-3 py-1 text-xs font-black ${canStartScheduledQuiz ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {canStartScheduledQuiz ? "Start window open" : "Waiting for time"}
              </span>
            </div>
            {upcomingQuiz && (
              <div className="grid gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-3 sm:grid-cols-2 md:grid-cols-[110px_130px_1fr] md:items-center">
                <CompactInfo label="Date" value={formatDisplayDate(upcomingQuiz.date)} />
                <div className="rounded-md bg-white/60 px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-wide text-cyan-700">Time</p>
                  {isScheduleEditing ? (
                    <div className="mt-1">
                      <input
                        type="time"
                        value={draftQuizTime}
                        onChange={(event) => setDraftQuizTime(event.target.value)}
                        className="min-h-9 w-full rounded-md border border-cyan-200 bg-white px-2 text-sm font-black text-cyan-950"
                      />
                      <p className={`mt-1 text-[11px] font-bold ${isDraftScheduleValid ? "text-cyan-800" : "text-rose-600"}`}>
                        Earliest: {formatDisplayTime(minSchedule)}
                      </p>
                    </div>
                  ) : (
                  <p className="mt-1 text-base font-black text-cyan-950 sm:text-lg">{formatDisplayTime(setup.quizTime)}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wide text-cyan-700">Quiz topic</p>
                  <p className="mt-1 truncate text-sm font-black text-cyan-950">{upcomingQuiz.topic}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-cyan-800">
                    {upcomingQuiz.examName} / {upcomingQuiz.subject} / {upcomingQuiz.durationHours} hrs study block
                  </p>
                  <p className="mt-1 text-xs font-black text-cyan-900">
                    Pattern: {quizPattern.label} / {quizPattern.questionCount} questions / {quizPattern.durationMinutes} minutes
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <StatusPill label="Generation opens" value={generateAfter ? `${formatDisplayDate(generateAfter)} ${formatDisplayTime(generateAfter)}` : "-"} active={canGenerateInAdvance} />
              <StatusPill label="Quiz starts" value={scheduledAt ? `${formatDisplayDate(scheduledAt)} ${formatDisplayTime(scheduledAt)}` : "-"} active={canStartScheduledQuiz} />
              <StatusPill label="Question set" value={isPreparedForCurrentQuiz ? "Ready" : isGenerating ? "Preparing..." : "Not ready"} active={isPreparedForCurrentQuiz} />
            </div>
            {errorMessage && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{errorMessage}</p>}
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button onClick={() => void startScheduledQuiz()} disabled={!upcomingQuiz || !canStartScheduledQuiz || isGenerating}>
                <Sparkles className="size-4" aria-hidden />
                {isPreparedForCurrentQuiz ? "Start scheduled quiz" : isGenerating ? "Preparing..." : "Prepare & start"}
              </Button>
              {isScheduleEditing ? (
                <>
                  <Button variant="secondary" onClick={() => void saveScheduleTime()} disabled={!isDraftScheduleValid}>
                    Save time
                  </Button>
                  <Button variant="ghost" onClick={() => {
                    setDraftQuizTime(setup.quizTime);
                    setIsScheduleEditing(false);
                    setErrorMessage("");
                  }}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => {
                  setDraftQuizTime(setup.quizTime);
                  setIsScheduleEditing(true);
                }}>
                  Change schedule time
                </Button>
              )}
            </div>
            {!canGenerateInAdvance && generateAfter && (
              <p className="text-sm font-semibold text-slate-500">Questions will be generated automatically 5 minutes before the scheduled quiz time.</p>
            )}
            {canGenerateInAdvance && !canStartScheduledQuiz && (
              <p className="text-sm font-semibold text-slate-500">Quiz can start only at the scheduled local time.</p>
            )}
          </Card>

          <Card className="space-y-3 p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <History className="size-6 text-brand" aria-hidden />
              <div>
                <h3 className="text-lg font-black sm:text-xl">Quiz history</h3>
                <p className="text-sm leading-5 text-slate-500">Past attempts appear here.</p>
              </div>
            </div>
            {setup.history.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-500">No quiz attempted yet.</div>
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1 lg:max-h-[520px]">
                {setup.history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedHistoryId((current) => current === item.id ? "" : item.id)}
                    className={`w-full rounded-md border p-2.5 text-left transition ${selectedHistoryId === item.id ? "border-ink bg-slate-50" : "border-slate-200 hover:border-ink hover:bg-slate-50"}`}
                  >
                    <p className="line-clamp-2 text-sm font-black">{item.topic}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {formatDisplayDate(item.date)} at {formatDisplayTime(item.time)} / {item.status}{typeof item.accuracy === "number" ? ` / ${item.accuracy}%` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
        {selectedHistory && (
          <HistoryReview item={selectedHistory} />
        )}
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <Card className="space-y-5">
          <BookOpenCheck className="size-8 text-brand" aria-hidden />
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Quiz Summary</p>
            <h2 className="mt-2 text-3xl font-black">{firstGroup?.subject ?? "Scheduled quiz"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {quizPattern.label} / {questions.length} questions / {quizPattern.durationMinutes} minutes
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryMetric label="Score" value={`${summary.score}`} />
            <SummaryMetric label="Accuracy" value={`${summary.accuracy}%`} />
            <SummaryMetric label="Correct" value={String(summary.correct)} />
            <SummaryMetric label="Wrong" value={String(summary.wrong)} />
            <SummaryMetric label="Skipped" value={String(summary.skipped)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TopicSummary title="Strong topics" items={summary.strongTopics} empty="No strong topic detected yet." tone="emerald" />
            <TopicSummary title="Weak topics" items={summary.weakTopics} empty="No weak topic detected yet." tone="rose" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => {
              setConfirmed(false);
              setQuestions([]);
              setAnswers([]);
              setCurrentQuestionIndex(0);
              setSelectedOption("");
              setIsFinished(false);
            }}>
              Back to quiz schedule
            </Button>
            <Link to="/planner" className="inline-flex min-h-10 items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-ink ring-1 ring-slate-200">
              View study plan
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!activeQuestion) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="space-y-4">
          <BookOpenCheck className="size-8 text-brand" aria-hidden />
          <h2 className="text-2xl font-black">Quiz is not ready yet</h2>
          <p className="text-sm leading-6 text-slate-500">Questions could not be generated for the selected topics. Try again or choose more completed topics.</p>
          <Button onClick={() => void preGenerateQuestions()} disabled={isGenerating}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  const options = activeQuestion.options ?? [];
  const progressPercent = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-3 pb-24 xl:pb-6">
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{quizPattern.label}</p>
            <h2 className="text-xl font-bold">{firstGroup?.subject ?? activeQuestion.topic}</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="size-4" aria-hidden />
            {formatDuration(remainingSeconds)}
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-brand" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <Card className="max-h-[calc(100vh-250px)] min-h-[360px] overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-md bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
            {activeQuestion.difficulty} / {activeQuestion.topic} / +{activeQuestion.marks}
            {activeQuestion.negativeMarks ? `, -${activeQuestion.negativeMarks}` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" aria-label="Bookmark question">
              <Bookmark className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" aria-label="Review later">
              <Flag className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <h3 className="mt-4 text-xl font-bold leading-snug xl:text-2xl">{activeQuestion.question}</h3>
        <p className="mt-2 text-sm text-slate-500">Subtopic: {activeQuestion.subtopic}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {options.length > 0 ? (
            options.map((option) => (
              <button
                key={option.id}
                onClick={() => setSelectedOption(option.value)}
                className={`min-h-12 rounded-md border px-3 py-2 text-left text-sm font-semibold transition xl:text-base ${
                  selectedOption === option.value ? "border-ink bg-slate-100" : "border-slate-200 hover:border-ink hover:bg-slate-50"
                }`}
              >
                {option.label}. {option.value}
              </button>
            ))
          ) : (
            <textarea
              className="min-h-28 rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 sm:col-span-2"
              placeholder="Type your answer"
              value={selectedOption}
              onChange={(event) => setSelectedOption(event.target.value)}
            />
          )}
        </div>

      </Card>

      <div className="sticky bottom-3 z-20 flex items-center justify-between rounded-lg border border-slate-200 bg-white/95 p-2 shadow-soft backdrop-blur">
        <Button variant="secondary" onClick={previousQuestion} disabled={currentQuestionIndex === 0}>
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Button>
        <Button onClick={nextQuestion}>
          {currentQuestionIndex >= questions.length - 1 ? "Finish quiz" : "Next"}
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
};

const SummaryMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
  </div>
);

const HistoryReview = ({ item }: { item: QuizHistoryItem }) => {
  const questions = item.questions ?? [];
  const answers = item.answers ?? [];
  const reviewSummary = calculateSummary(questions, answers);

  if (questions.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-xl font-black">Quiz review</h3>
        <p className="mt-2 text-sm font-semibold text-slate-500">Detailed questions were not saved for this older attempt.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-brand">Quiz review</p>
          <h3 className="mt-1 text-xl font-black">{item.topic}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{formatDisplayDate(item.date)} at {formatDisplayTime(item.time)} / {item.pattern?.label ?? "Scheduled quiz"}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniReviewStat label="Score" value={String(reviewSummary.score)} />
          <MiniReviewStat label="Accuracy" value={`${reviewSummary.accuracy}%`} />
          <MiniReviewStat label="Wrong" value={String(reviewSummary.wrong)} />
        </div>
      </div>
      <div className="space-y-3">
        {questions.map((question, index) => {
          const answer = answers.find((record) => record.questionId === question.id)?.answer ?? "";
          const isCorrect = answer ? isCorrectAnswer(question, answer) : false;
          const correctAnswer = resolveAnswerText(question, question.correctAnswer);
          return (
            <div key={question.id} className={`rounded-lg border p-3 ${isCorrect ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="max-w-4xl text-sm font-black leading-6">Q{index + 1}. {question.question}</p>
                <span className={`rounded-md px-2 py-1 text-xs font-black ${isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {isCorrect ? "Correct" : answer ? "Wrong" : "Skipped"}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <div className="rounded-md bg-white px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Your answer</p>
                  <p className="mt-1 font-bold text-slate-900">{answer ? resolveAnswerText(question, answer) : "Not attempted"}</p>
                </div>
                <div className="rounded-md bg-white px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Correct answer</p>
                  <p className="mt-1 font-bold text-slate-900">{correctAnswer}</p>
                </div>
              </div>
              {!isCorrect && (
                <div className="mt-2 rounded-md border border-rose-100 bg-white px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-wide text-rose-600">Explanation</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{question.explanation}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const MiniReviewStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-slate-50 px-3 py-2">
    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-black">{value}</p>
  </div>
);

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

const TopicSummary = ({
  title,
  items,
  empty,
  tone
}: {
  title: string;
  items: Array<{ topic: string; attempted: number; correct: number; accuracy: number }>;
  empty: string;
  tone: "emerald" | "rose";
}) => {
  const color = tone === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const badge = tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-lg font-black">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">{empty}</p>
        ) : (
          items.map((item) => (
            <div key={item.topic} className="rounded-md bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{item.topic}</p>
                  <p className="text-xs font-semibold text-slate-500">{item.correct}/{item.attempted} correct</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-black ${badge}`}>{item.accuracy}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white">
                <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(4, item.accuracy)}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const StatusPill = ({ label, value, active }: { label: string; value: string; active: boolean }) => (
  <div className={`rounded-md border px-3 py-2 ${active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
    <p className={`text-[11px] font-black uppercase tracking-wide ${active ? "text-emerald-700" : "text-slate-500"}`}>{label}</p>
    <p className={`mt-1 text-xs font-bold ${active ? "text-emerald-950" : "text-slate-700"}`}>{value}</p>
  </div>
);

const CompactInfo = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-white/60 px-3 py-2">
    <p className="text-[11px] font-black uppercase tracking-wide text-cyan-700">{label}</p>
    <p className="mt-1 text-sm font-black text-cyan-950">{value}</p>
  </div>
);
