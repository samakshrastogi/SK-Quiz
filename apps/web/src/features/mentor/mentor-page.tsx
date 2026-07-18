import axios from "axios";
import { Bot, Loader2, Menu, MessageSquareText, Plus, SendHorizontal, Sparkles, Trash2, UserRound, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api/client";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

interface MentorState {
  discoveredExams?: Array<{ id?: string; examName: string }>;
  selectedExamIds?: string[];
  activeExamId?: string;
  plan?: Array<{ examName: string; date: string; subject: string; topic: string; done?: boolean }>;
  quizHistory?: Array<{ examName?: string; topic: string; accuracy?: number; status: string }>;
}

interface Message {
  role: "user" | "mentor";
  text: string;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: Message[];
}

const chatHistoryKey = "sk-quiz-mentor-chat-history";
const examKey = (exam: { id?: string; examName: string }) => exam.id ?? exam.examName.trim().toLowerCase();
const todayIso = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const createChatId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `chat-${Date.now()}`);

const loadChatSessions = (): ChatSession[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(chatHistoryKey) ?? "[]") as ChatSession[];
    return Array.isArray(parsed) ? parsed.filter((session) => Array.isArray(session.messages)).slice(0, 24) : [];
  } catch {
    return [];
  }
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? "Mentor is temporarily unavailable. Please try again.";
  }
  return "Mentor is temporarily unavailable. Please try again.";
};

export const MentorPage = () => {
  const initialSessions = useMemo(() => loadChatSessions(), []);
  const [state, setState] = useState<MentorState>({});
  const [input, setInput] = useState("");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(initialSessions);
  const [activeChatId, setActiveChatId] = useState(() => initialSessions[0]?.id ?? createChatId());
  const [messages, setMessages] = useState<Message[]>(() => initialSessions[0]?.messages ?? []);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const response = await apiClient.get<{ data: MentorState }>("/onboarding/state");
      if (mounted) setState(response.data.data);
    };
    void load().catch(() => mounted && setState({}));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(chatHistoryKey, JSON.stringify(chatSessions));
  }, [chatSessions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  const activeExam = (state.discoveredExams ?? []).find((exam) => examKey(exam) === state.activeExamId) ?? (state.discoveredExams ?? []).find((exam) => (state.selectedExamIds ?? []).includes(examKey(exam)));
  const activePlan = (state.plan ?? []).filter((task) => !activeExam || task.examName === activeExam.examName);
  const activeHistory = (state.quizHistory ?? []).filter((item) => !activeExam || item.examName === activeExam.examName);
  const today = todayIso();
  const nextTask = activePlan.find((task) => !task.done && task.date >= today) ?? activePlan.find((task) => !task.done) ?? activePlan[0];
  const completedQuizzes = useMemo(() => activeHistory.filter((item) => item.status === "Completed"), [activeHistory]);
  const weakTopics = useMemo(() => completedQuizzes.filter((item) => (item.accuracy ?? 100) < 65).sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100)).slice(0, 5).map((item) => item.topic), [completedQuizzes]);
  const strongTopics = useMemo(() => completedQuizzes.filter((item) => (item.accuracy ?? 0) >= 80).sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0)).slice(0, 5).map((item) => item.topic), [completedQuizzes]);
  const recentAccuracy = completedQuizzes.length > 0 ? Math.round(completedQuizzes.reduce((sum, item) => sum + (item.accuracy ?? 0), 0) / completedQuizzes.length) : undefined;

  const rememberChat = (nextMessages: Message[], question: string) => {
    const title = (nextMessages.find((message) => message.role === "user")?.text || question || "New mentor chat").slice(0, 58);
    const nextSession: ChatSession = { id: activeChatId, title, updatedAt: new Date().toISOString(), messages: nextMessages };
    setChatSessions((current) => [nextSession, ...current.filter((session) => session.id !== activeChatId)].slice(0, 24));
  };

  const startNewChat = () => {
    const id = createChatId();
    setActiveChatId(id);
    setMessages([]);
    setInput("");
    setError("");
    setHistoryOpen(false);
  };

  const openChat = (session: ChatSession) => {
    setActiveChatId(session.id);
    setMessages(session.messages);
    setError("");
    setHistoryOpen(false);
  };

  const deleteChat = (sessionId: string) => {
    setChatSessions((current) => current.filter((session) => session.id !== sessionId));
    if (sessionId === activeChatId) startNewChat();
  };

  const ask = async (questionOverride?: string) => {
    const question = (questionOverride ?? input).trim();
    if (!question || isThinking) return;
    const nextMessages = [...messages, { role: "user" as const, text: question }];
    setMessages(nextMessages);
    rememberChat(nextMessages, question);
    setInput("");
    setIsThinking(true);
    setError("");

    try {
      const response = await apiClient.post<{ data: { answer: string } }>("/mentor/ask", {
        question,
        examName: activeExam?.examName ?? "Current exam",
        nextTask: nextTask ? `${nextTask.subject}: ${nextTask.topic}` : undefined,
        weakTopics,
        strongTopics,
        recentAccuracy,
        history: messages.slice(-8)
      });
      const finalMessages = [...nextMessages, { role: "mentor" as const, text: response.data.data.answer }];
      setMessages(finalMessages);
      rememberChat(finalMessages, question);
    } catch (requestError) {
      const fallback = weakTopics[0]
        ? `Focus on ${weakTopics[0]} first. Revise your mistakes, solve 10 easy questions, then attempt a short timed set.`
        : nextTask
          ? `Start with ${nextTask.topic}. Spend the first 20 minutes on concepts, then practice examples, then summarize mistakes.`
          : "Create a study plan first so I can give precise topic-wise guidance.";
      const finalMessages = [...nextMessages, { role: "mentor" as const, text: fallback }];
      setMessages(finalMessages);
      rememberChat(finalMessages, question);
      setError(getErrorMessage(requestError));
    } finally {
      setIsThinking(false);
    }
  };

  const quickPrompts = ["What should I study today?", "Why am I weak in my lowest topic?", "Create a revision plan for this week.", "Explain my next topic simply."];

  return (
    <div className="mx-auto h-[calc(100dvh-9rem)] max-w-6xl overflow-hidden pb-20 lg:h-[calc(100vh-6rem)] xl:pb-0">
      <section className="grid h-full min-h-0 gap-3 lg:grid-cols-[280px_1fr]">
        <Card className="hidden min-h-[13rem] flex-col overflow-hidden p-0 lg:flex lg:min-h-0">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-brand">Mentor history</p>
              <h1 className="text-lg font-black">Chat History</h1>
            </div>
            <button type="button" onClick={startNewChat} aria-label="Start new mentor chat" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white shadow-soft transition hover:bg-brand"><Plus className="size-4" aria-hidden /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {chatSessions.length === 0 ? (
              <div className="rounded-md bg-cyan-50 p-3 text-sm font-bold leading-6 text-cyan-950">Your mentor conversations will appear here after your first message.</div>
            ) : chatSessions.map((session) => (
              <div key={session.id} className={`group flex items-center gap-2 rounded-md border p-2 transition ${session.id === activeChatId ? "border-ink bg-ink text-white" : "border-slate-200 bg-white hover:border-brand/40"}`}>
                <button type="button" onClick={() => openChat(session)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-2 text-sm font-black"><MessageSquareText className="size-4 shrink-0" aria-hidden /> <span className="truncate">{session.title}</span></span>
                  <span className={`mt-1 block text-[11px] font-bold ${session.id === activeChatId ? "text-white/70" : "text-slate-500"}`}>{new Date(session.updatedAt).toLocaleString()}</span>
                </button>
                <button type="button" onClick={() => deleteChat(session.id)} className={`rounded p-1 opacity-70 transition hover:opacity-100 ${session.id === activeChatId ? "text-white" : "text-slate-500"}`} aria-label={`Delete ${session.title}`}><Trash2 className="size-4" aria-hidden /></button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="border-b border-slate-200 p-3 lg:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black lg:text-xl">Mentor Chat</h2>
                <p className="mt-1 text-xs text-slate-500 lg:text-sm">Answers use your active exam, plan, quiz history, weak topics, and strong topics.</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setHistoryOpen(true)} aria-label="Open chat history" className="flex size-9 items-center justify-center rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 lg:hidden">
                  <Menu className="size-5" aria-hidden />
                </button>
                <Sparkles className="size-5 text-brand" aria-hidden />
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 lg:p-4">
            {messages.length === 0 && (
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-700">Ask anything about what to study, why a topic is weak, revision strategy, or explanations in Hindi/English.</p>
                <div className="mt-3 flex flex-wrap gap-2">{quickPrompts.map((prompt) => <button key={prompt} onClick={() => void ask(prompt)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-black text-slate-700 transition hover:border-ink hover:bg-slate-50">{prompt}</button>)}</div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "mentor" && <BubbleIcon icon={Bot} />}
                <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm font-semibold leading-6 lg:max-w-[82%] lg:px-4 lg:py-3 ${message.role === "mentor" ? "bg-ink text-white" : "bg-cyan-50 text-cyan-950"}`}><FormattedMessage text={message.text} /></div>
                {message.role === "user" && <BubbleIcon icon={UserRound} />}
              </div>
            ))}
            {isThinking && <div className="flex items-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="size-4 animate-spin" aria-hidden />Thinking...</div>}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-slate-200 p-3 lg:p-4">
            {error && <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{error}</p>}
            <div className="flex gap-2">
              <Input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Ask what to revise, why you are weak, or what to study today..." disabled={isThinking} />
              <Button aria-label="Send message" onClick={() => void ask()} disabled={isThinking || input.trim().length === 0}>{isThinking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}</Button>
            </div>
          </div>
        </Card>
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink/35 backdrop-blur-sm lg:hidden" onMouseDown={() => setHistoryOpen(false)}>
            <Card className="h-full w-[min(88vw,360px)] overflow-hidden rounded-none p-0" onMouseDown={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-brand">Mentor history</p>
                  <h2 className="text-lg font-black">Choose a conversation</h2>
                </div>
                <button type="button" aria-label="Close chat history" onClick={() => setHistoryOpen(false)} className="flex size-9 items-center justify-center rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 p-3">
                <span className="text-sm font-bold text-slate-500">{chatSessions.length} conversations</span>
                <Button onClick={startNewChat} className="min-h-9 px-3"><Plus className="size-4" aria-hidden />New chat</Button>
              </div>
              <div className="h-[calc(100dvh-8.5rem)] space-y-2 overflow-y-auto p-3">
                {chatSessions.length === 0 ? (
                  <div className="rounded-md bg-cyan-50 p-3 text-sm font-bold leading-6 text-cyan-950">Your mentor conversations will appear here after your first message.</div>
                ) : chatSessions.map((session) => (
                  <div key={session.id} className={`group flex items-center gap-2 rounded-md border p-2 transition ${session.id === activeChatId ? "border-ink bg-ink text-white" : "border-slate-200 bg-white hover:border-brand/40"}`}>
                    <button type="button" onClick={() => openChat(session)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-2 text-sm font-black"><MessageSquareText className="size-4 shrink-0" aria-hidden /><span className="truncate">{session.title}</span></span>
                      <span className={`mt-1 block text-[11px] font-bold ${session.id === activeChatId ? "text-white/70" : "text-slate-500"}`}>{new Date(session.updatedAt).toLocaleString()}</span>
                    </button>
                    <button type="button" onClick={() => deleteChat(session.id)} className={`rounded p-1 opacity-70 transition hover:opacity-100 ${session.id === activeChatId ? "text-white" : "text-slate-500"}`} aria-label={`Delete ${session.title}`}><Trash2 className="size-4" aria-hidden /></button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
};

const BubbleIcon = ({ icon: Icon }: { icon: typeof Bot }) => <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600"><Icon className="size-4" aria-hidden /></div>;

const FormattedMessage = ({ text }: { text: string }) => {
  const normalized = text.replace(/\s+\*\*(Day\s+\d+[^*]*?)\*\*/g, "\n\n**$1**").replace(/\s+(\d+\.\s+\*\*)/g, "\n\n$1").replace(/\s+(-\s+\*\*)/g, "\n$1").replace(/\s+(Your Action Step:)/gi, "\n\n$1").replace(/\s+(Action Step:)/gi, "\n\n$1").trim();
  const paragraphs = normalized.split(/\n{2,}/).filter(Boolean);
  return <div className="space-y-2">{paragraphs.map((paragraph, index) => <p key={`${paragraph}-${index}`} className="whitespace-pre-line">{renderInlineBold(paragraph)}</p>)}</div>;
};

const renderInlineBold = (text: string): ReactNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={`${part}-${index}`} className="font-black">{part.slice(2, -2)}</strong> : <span key={`${part}-${index}`}>{part}</span>);
};

