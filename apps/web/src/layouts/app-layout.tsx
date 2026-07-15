import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { BookOpenCheck, CalendarClock, Check, ChevronDown, Code2, GraduationCap, MessageSquareText, Sparkles, UserCircle, X } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_STATE_UPDATED_EVENT, AUTH_EXPIRED_EVENT, apiClient, centralProfileUrl, getCentralSessionState, isApiNetworkCoolingDown, redirectToCentralLogin, requestCentralAppToken } from "../api/client";
import { useAuthStore } from "../store/auth-store";

const navItems = [
  { to: "/onboarding", label: "Onboarding", icon: GraduationCap },
  { to: "/planner", label: "Planner", icon: CalendarClock },
  { to: "/quiz", label: "Quiz", icon: BookOpenCheck },
  { to: "/mentor", label: "Mentor", icon: MessageSquareText },
  { to: "/profile", label: "Dashboard", icon: UserCircle }
];

interface LayoutState {
  discoveredExams?: Array<{ id?: string; examName: string }>;
  selectedExamIds?: string[];
  activeExamId?: string;
  plan?: Array<{ date: string; topic: string; examName?: string }>;
  quizHistory?: Array<{ status: string; examName?: string }>;
  quizTime?: string;
}

interface ProfileSummary {
  name?: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
  avatarInitials?: string;
}

const examKey = (exam: { id?: string; examName: string }) => exam.id ?? exam.examName.trim().toLowerCase();
const publicPaths = new Set(["/", "/login", "/register", "/forgot-password"]);

const normalizeLayoutState = (value: LayoutState): LayoutState => {
  const discovered = [...(value.discoveredExams ?? [])];
  const selected = new Set(value.selectedExamIds ?? []);
  const planExamNames = [...new Set((value.plan ?? []).map((task) => task.examName).filter((name): name is string => Boolean(name?.trim())))];

  for (const examName of planExamNames) {
    const existing = discovered.find((exam) => exam.examName === examName || examKey(exam) === examName.trim().toLowerCase());
    const key = existing ? examKey(existing) : examName.trim().toLowerCase();
    if (!existing) discovered.push({ examName });
    selected.add(key);
  }

  for (const exam of discovered) {
    const key = examKey(exam);
    if ((value.plan ?? []).some((task) => task.examName === exam.examName)) selected.add(key);
  }

  const trackedExams = discovered;
  const activeExamId = value.activeExamId && trackedExams.some((exam) => examKey(exam) === value.activeExamId)
    ? value.activeExamId
    : trackedExams[0]
      ? examKey(trackedExams[0])
      : value.activeExamId;

  return {
    ...value,
    discoveredExams: discovered,
    selectedExamIds: [...selected],
    activeExamId
  };
};

const examInitials = (name: string) => {
  const cleaned = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  const acronym = words
    .filter((word) => word.length > 2 || /^[A-Z0-9]+$/.test(word))
    .slice(0, 4)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  const suffix = name.match(/\(([^)]+)\)/)?.[1]?.split(/\s+/).slice(0, 2).join(" ");
  return [acronym || words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "EXAM", suffix].filter(Boolean).join(" ");
};

const userInitials = (profile: ProfileSummary) => {
  if (profile.avatarInitials) return profile.avatarInitials;
  const source = profile.name || profile.email || "Student";
  const parts = source.includes("@") ? source.split("@")[0]?.split(/[._\-\s]+/) ?? [] : source.split(/\s+/);
  return parts.filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
};

export const AppLayout = () => {
  const [state, setState] = useState<LayoutState>({});
  const [profile, setProfile] = useState<ProfileSummary>({});
  const [examMenuOpen, setExamMenuOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const activeStartedAtRef = useRef<number | null>(null);
  const [avatarFailedUrl, setAvatarFailedUrl] = useState("");
  const usagePostInFlightRef = useRef(false);
  const examMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const layoutLoadInFlightRef = useRef(false);
  const profileLoadInFlightRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAuthStore((auth) => auth.accessToken);
  const centralUser = useAuthStore((auth) => auth.user);
  const clearSession = useAuthStore((auth) => auth.clearSession);
  const isPublicRoute = publicPaths.has(location.pathname);
  const normalizedState = normalizeLayoutState(state);
  const trackedExams = normalizedState.discoveredExams ?? [];
  const activeExamId = normalizedState.activeExamId || (trackedExams[0] ? examKey(trackedExams[0]) : "");
  const activeExam = trackedExams.find((exam) => examKey(exam) === activeExamId);
  const displayProfile = { ...profile, name: centralUser?.name || profile.name, email: centralUser?.email || profile.email, avatarUrl: centralUser?.avatarUrl || profile.avatarUrl };
  const initials = userInitials(displayProfile);
  const tutorialKey = `sk-quiz-tutorial-seen-${profile.email || "student"}`;
  const visibleNavItems = navItems;

  const loadLayoutState = useCallback(async (mounted = true) => {
    if (layoutLoadInFlightRef.current || isApiNetworkCoolingDown()) return;
    layoutLoadInFlightRef.current = true;
    try {
      const response = await apiClient.get<{ data: LayoutState }>("/onboarding/state");
      const normalized = normalizeLayoutState(response.data.data);
      if (mounted) setState(normalized);
      if (JSON.stringify(normalized) !== JSON.stringify(response.data.data)) {
        await apiClient.put("/onboarding/state", { state: normalized });
      }
    } catch (error) {
      if (mounted && (error as { response?: unknown })?.response) setState({});
    } finally {
      layoutLoadInFlightRef.current = false;
    }
  }, []);

  const loadProfile = useCallback(async (mounted = true) => {
    if (profileLoadInFlightRef.current || isApiNetworkCoolingDown()) return;
    profileLoadInFlightRef.current = true;
    try {
      const response = await apiClient.get<{ data: { user?: ProfileSummary } }>("/profile/analytics");
      if (mounted) setProfile(response.data.data.user ?? {});
    } catch (error) {
      if (mounted && (error as { response?: unknown })?.response) setProfile({});
    } finally {
      profileLoadInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!accessToken || isPublicRoute) return;
    let mounted = true;

    const refreshData = () => {
      void loadLayoutState(mounted);
      void loadProfile(mounted);
    };

    let checkInFlight = false;
    const verifyCentralSession = async () => {
      if (checkInFlight) return;
      checkInFlight = true;
      const active = await getCentralSessionState();
      checkInFlight = false;
      if (active === false) {
        clearSession();
        redirectToCentralLogin();
        return;
      }
      if (active === true) {
        try {
          await requestCentralAppToken();
          refreshData();
        } catch {
          // A temporary token request failure must not create a redirect loop.
        }
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void verifyCentralSession();
    };

    void verifyCentralSession();
    const onStateUpdated = refreshData;
    window.addEventListener(APP_STATE_UPDATED_EVENT, onStateUpdated);
    window.addEventListener("focus", verifyCentralSession);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(verifyCentralSession, 30_000);
    return () => {
      mounted = false;
      window.removeEventListener(APP_STATE_UPDATED_EVENT, onStateUpdated);
      window.removeEventListener("focus", verifyCentralSession);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [accessToken, clearSession, isPublicRoute, loadLayoutState, loadProfile]);

  useEffect(() => {
    if (!accessToken || isPublicRoute || !profile.email) return;
    if (!window.localStorage.getItem(tutorialKey)) {
      setTutorialOpen(true);
    }
  }, [accessToken, isPublicRoute, profile.email, tutorialKey]);

  const closeTutorial = () => {
    window.localStorage.setItem(tutorialKey, "true");
    setTutorialOpen(false);
  };

  const saveLayoutState = useCallback(async (nextState: LayoutState) => {
    const normalized = normalizeLayoutState(nextState);
    setState(normalized);
    await apiClient.put("/onboarding/state", { state: normalized });
  }, []);

  useEffect(() => {
    const isAuthRoute = ["/login", "/register", "/forgot-password"].includes(location.pathname);

    if (!accessToken && !isPublicRoute) {
      void requestCentralAppToken().catch(() => redirectToCentralLogin());
      return;
    }

    if (!accessToken && location.pathname === "/") {
      void requestCentralAppToken()
        .then(() => navigate({ to: "/onboarding", replace: true }))
        .catch(() => undefined);
      return;
    }

    if (accessToken && (location.pathname === "/" || isAuthRoute)) {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [accessToken, isPublicRoute, location.pathname, navigate]);

  useEffect(() => {
    if (!examMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (examMenuRef.current && !examMenuRef.current.contains(event.target as Node)) {
        setExamMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", closeOnOutsideClick);
    return () => window.removeEventListener("mousedown", closeOnOutsideClick);
  }, [examMenuOpen]);
  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", closeOnOutsideClick);
    return () => window.removeEventListener("mousedown", closeOnOutsideClick);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!accessToken || isPublicRoute) return;
    const onAuthExpired = () => {
      clearSession();
      redirectToCentralLogin();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    };
  }, [accessToken, clearSession, isPublicRoute, navigate]);

  useEffect(() => {
    if (!accessToken || isPublicRoute) return;

    const isActive = () => document.visibilityState === "visible" && document.hasFocus();
    const usageUrl = `${apiClient.defaults.baseURL ?? ""}/profile/usage`;
    const flushUsage = (useKeepalive = false) => {
      const startedAt = activeStartedAtRef.current;
      if (!startedAt) return;
      const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
      activeStartedAtRef.current = isActive() ? Date.now() : null;
      if (durationSeconds < 1) return;
      if (!useKeepalive && (usagePostInFlightRef.current || isApiNetworkCoolingDown())) return;

      const payload = JSON.stringify({
        durationSeconds,
        path: location.pathname,
        activeExamId
      });

      if (useKeepalive) {
        void fetch(usageUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`
          },
          body: payload,
          keepalive: true
        }).catch(() => undefined);
        return;
      }

      usagePostInFlightRef.current = true;
      void apiClient.post("/profile/usage", JSON.parse(payload)).catch(() => undefined).finally(() => { usagePostInFlightRef.current = false; });
    };

    const syncActiveState = () => {
      if (isActive()) {
        activeStartedAtRef.current = activeStartedAtRef.current ?? Date.now();
      } else {
        flushUsage(false);
      }
    };
    const onPageHide = () => flushUsage(true);

    syncActiveState();
    const interval = window.setInterval(() => { if (navigator.onLine && document.visibilityState === "visible") flushUsage(false); }, 120_000);
    window.addEventListener("focus", syncActiveState);
    window.addEventListener("blur", syncActiveState);
    document.addEventListener("visibilitychange", syncActiveState);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      flushUsage(true);
      window.clearInterval(interval);
      window.removeEventListener("focus", syncActiveState);
      window.removeEventListener("blur", syncActiveState);
      document.removeEventListener("visibilitychange", syncActiveState);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [accessToken, activeExamId, isPublicRoute, location.pathname]);

  if (isPublicRoute) {
    if (accessToken && location.pathname === "/") {
      return null;
    }
    return (
      <>
        <Outlet />
        <DeveloperCredit />
      </>
    );
  }

  if (!accessToken) {
    return null;
  }

  const updateActiveExam = async (nextExamId: string) => {
    setExamMenuOpen(false);
    await saveLayoutState({ ...state, activeExamId: nextExamId });

  };

  return (
  <div className="min-h-screen bg-page text-ink">

    <div>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/profile" className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-ink text-sm font-black text-white shadow-soft">
              SK
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-black">SK Quiz Coach</p>
              <p className="hidden text-xs font-semibold uppercase tracking-wide text-brand sm:block">Adaptive Tutor</p>
            </div>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {trackedExams.length > 0 && (
              <div ref={examMenuRef} className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setExamMenuOpen((current) => !current)}
                  className="flex h-10 min-w-0 max-w-[420px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm shadow-soft transition hover:border-brand/40"
                  aria-expanded={examMenuOpen}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
                    <GraduationCap className="size-3.5" aria-hidden />
                  </span>
                  <span className="hidden shrink-0 text-xs font-black uppercase tracking-wide text-slate-500 lg:inline">Exam</span>
                  <span className="max-w-[180px] truncate font-black text-ink lg:max-w-[260px]">{activeExam ? examInitials(activeExam.examName) : "Select exam"}</span>
                  <ChevronDown className="size-4 shrink-0 text-slate-500" aria-hidden />
                </button>
                {examMenuOpen && (
                  <div className="absolute right-0 top-12 z-50 max-h-72 w-[420px] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-soft">
                    {trackedExams.map((exam) => {
                      const key = examKey(exam);
                      const isActive = key === activeExamId;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setExamMenuOpen(false);
                            void updateActiveExam(key);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-brand/5"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-black text-brand">{examInitials(exam.examName)}</span>
                          <span className="min-w-0 flex-1 truncate">{exam.examName}</span>
                          {isActive && <Check className="size-4 shrink-0 text-brand" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((current) => !current)}
                className="flex size-11 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-sm font-black text-brand shadow-soft transition hover:bg-slate-50"
                aria-label="Open account menu"
                aria-expanded={profileMenuOpen}
              >
                {displayProfile.avatarUrl && avatarFailedUrl !== displayProfile.avatarUrl ? (
                  <img src={displayProfile.avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" onError={() => setAvatarFailedUrl(displayProfile.avatarUrl ?? "")} />
                ) : (
                  initials
                )}
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 top-14 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-soft">
                  <div className="flex items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand/10 text-sm font-black text-brand">
                      {displayProfile.avatarUrl && avatarFailedUrl !== displayProfile.avatarUrl ? <img src={displayProfile.avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" onError={() => setAvatarFailedUrl(displayProfile.avatarUrl ?? "")} /> : initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-ink">{displayProfile.name || "SK Quiz learner"}</span>
                      <span className="block truncate text-xs font-bold text-slate-500">{displayProfile.email || "Signed in with SK Auth"}</span>
                    </span>
                  </div>
                  <a
                    href={centralProfileUrl}
                    className="mt-3 flex w-full items-center justify-center rounded-xl bg-ink px-3 py-2 text-sm font-black text-white transition hover:bg-brand"
                  >
                    Manage your SK account
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 pb-32 pt-6 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Outlet />
        </motion.div>
      </main>
    </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around gap-1 overflow-x-auto rounded-t-2xl border border-slate-200 bg-white/95 p-2 shadow-soft backdrop-blur sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-auto sm:max-w-[calc(100vw-1rem)] sm:-translate-x-1/2 sm:justify-center sm:rounded-2xl sm:bg-white/92 sm:gap-2">
      {visibleNavItems.map((item) => {
        const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${isActive ? "min-w-[8.5rem] bg-ink text-white shadow-soft" : "w-12 text-slate-500 hover:bg-slate-100 hover:text-ink"}`}
            aria-label={item.label}
          >
            <item.icon className="size-5 shrink-0" aria-hidden />
            <span className={isActive ? "inline truncate" : "sr-only"}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
    {tutorialOpen && <TutorialModal state={normalizedState} onClose={closeTutorial} onNavigate={(to) => { closeTutorial(); void navigate({ to }); }} />}
    <DeveloperCredit />
  </div>
  );
};

const TutorialModal = ({ onClose, onNavigate, state }: { onClose: () => void; onNavigate: (to: string) => void; state: LayoutState }) => {
  const hasExam = (state.discoveredExams ?? []).length > 0;
  const hasPlan = (state.plan ?? []).length > 0;
  const hasQuizTime = Boolean(state.quizTime);
  const hasQuizHistory = (state.quizHistory ?? []).length > 0;
  const steps = [
    { icon: GraduationCap, title: "Choose exams", text: hasExam ? "Your exam selector is ready. Switch exams from the topbar any time." : "Start by searching your target exam and reviewing its details.", done: hasExam, to: "/onboarding" },
    { icon: CalendarClock, title: "Set a plan", text: hasPlan ? "Your dated plan is saved and drives quiz topics automatically." : "Prioritize syllabus sections, add study hours, and generate your dated plan.", done: hasPlan, to: "/onboarding" },
    { icon: BookOpenCheck, title: "Schedule quizzes", text: hasQuizTime ? "Your daily quiz time is saved. Quizzes open from the scheduled window." : "Choose your quiz time while setting the plan.", done: hasQuizTime, to: "/onboarding" },
    { icon: MessageSquareText, title: "Use mentor", text: hasQuizHistory ? "Your mentor can now use quiz history for sharper guidance." : "Ask what to study today, revision strategy, or weak-topic help.", done: hasQuizHistory, to: "/mentor" }
  ];
  const nextStep = steps.find((step) => !step.done) ?? steps.at(-1) ?? { title: "Open mentor", to: "/mentor", done: true };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/35 px-4 py-6 backdrop-blur-sm" onMouseDown={onClose} role="presentation">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-brand">Quick tutorial</p>
            <h2 className="text-2xl font-black">How SK Quiz Coach works</h2>
          <p className="mt-1 text-sm text-slate-500">This guide adapts to what you have already completed.</p>
          </div>
          <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50" onClick={onClose} aria-label="Close tutorial">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <step.icon className="size-4" aria-hidden />
                </span>
                <p className="text-sm font-black">{index + 1}. {step.title}</p>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black ${step.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {step.done ? "Done" : "Next"}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{step.text}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <Sparkles className="size-4 text-brand" aria-hidden />
            Your data updates automatically after plan, quiz, and profile changes.
          </p>
          <button type="button" className="rounded-md bg-ink px-4 py-2 text-sm font-black text-white" onClick={() => onNavigate(nextStep.to)}>
            {nextStep.done ? "Open mentor" : `Continue: ${nextStep.title}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const DeveloperCredit = () => {
  const [open, setOpen] = useState(false);
  const creditRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (open && !creditRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div ref={creditRef} className="group fixed bottom-24 right-4 z-50 flex items-center gap-2">
      <div className={`${open ? "pointer-events-auto max-w-[280px] px-3 opacity-100" : "pointer-events-none max-w-0 px-0 opacity-0 group-hover:pointer-events-auto group-hover:max-w-[280px] group-hover:px-3 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:max-w-[280px] group-focus-within:px-3 group-focus-within:opacity-100"} overflow-hidden whitespace-nowrap rounded-md border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600 shadow-soft transition-all duration-300`}>
        Developed by{" "}
        <a className="font-black text-emerald-600 underline decoration-2 underline-offset-4" href="https://www.linkedin.com/in/samaksh-rastogi-9638b9254/" target="_blank" rel="noreferrer">Samaksh Rastogi</a>
      </div>
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex size-11 items-center justify-center rounded-full bg-ink text-white shadow-soft" aria-label={open ? "Hide developer credit" : "Show developer credit"} aria-expanded={open}>
        <Code2 className="size-5" aria-hidden />
      </button>
    </div>
  );
};
