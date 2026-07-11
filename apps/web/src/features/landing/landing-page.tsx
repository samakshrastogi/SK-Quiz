import { Link } from "@tanstack/react-router";
import gsap from "gsap";
import { BarChart3, BookOpenCheck, CalendarClock, GraduationCap, Sparkles, Target } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/button";

const features = [
  { title: "Discover any exam", body: "Get a clear guide with pattern, syllabus, eligibility, salary context, marking, and preparation order.", icon: GraduationCap },
  { title: "Plan around your time", body: "Create realistic daily tasks from your study hours, priorities, start date, and quiz schedule.", icon: CalendarClock },
  { title: "Quiz from prepared topics", body: "Scheduled quizzes follow the exam pattern and stay limited to topics you actually studied.", icon: BookOpenCheck },
  { title: "Track readiness", body: "See exam-wise progress, weak areas, study time, quiz history, and personalized next steps.", icon: BarChart3 }
];

export const LandingPage = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.set("[data-landing-content]", { opacity: 0, y: 12 });
      gsap
        .timeline()
        .from("[data-intro-logo]", { scale: 0.82, opacity: 0, duration: 0.45, ease: "back.out(1.7)" })
        .from("[data-intro-word]", { y: 18, opacity: 0, duration: 0.45, stagger: 0.08, ease: "power3.out" }, "-=0.14")
        .from("[data-intro-line]", { scaleX: 0, transformOrigin: "left center", duration: 0.5, ease: "power2.out" }, "-=0.18")
        .to(introRef.current, { opacity: 0, y: -16, duration: 0.42, delay: 0.35, ease: "power2.inOut", pointerEvents: "none" })
        .to("[data-landing-content]", { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, "-=0.05")
        .from("[data-hero]", { y: 28, opacity: 0, duration: 0.65, stagger: 0.1, ease: "power3.out" }, "-=0.2")
        .from("[data-feature]", { y: 20, opacity: 0, duration: 0.5, stagger: 0.07, ease: "power2.out" }, "-=0.25");
      gsap.to("[data-float]", { y: -10, duration: 2.2, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: 0.2 });
    }, rootRef);
    return () => context.revert();
  }, []);

  return (
    <div ref={rootRef} className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f6fbfd_48%,#eef5f9_100%)] text-ink">
      <div ref={introRef} className="fixed inset-0 z-[80] flex items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f6fbfd_100%)] px-4">
        <div className="w-full max-w-md text-center">
          <div data-intro-logo className="mx-auto flex size-16 items-center justify-center rounded-xl border border-brand/20 bg-brand/10 text-2xl font-black text-brand shadow-soft">
            SK
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-3xl font-black sm:text-4xl">
            <span data-intro-word>Quiz</span>
            <span data-intro-word className="text-brand">Coach</span>
          </div>
          <p data-intro-word className="mt-3 text-sm font-black uppercase tracking-wide text-slate-500">Adaptive exam preparation</p>
          <div className="mx-auto mt-5 h-1 w-48 overflow-hidden rounded-full bg-slate-200">
            <div data-intro-line className="h-full w-full rounded-full bg-brand" />
          </div>
        </div>
      </div>

      <div data-landing-content>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border border-brand/20 bg-brand/10 text-sm font-black text-brand shadow-soft">SK</div>
          <div>
            <p className="text-sm font-black">SK Quiz Coach</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Adaptive Tutor</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="secondary">Login</Button>
          </Link>
          <Link to="/register">
            <Button>Register</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8 lg:py-14">
        <section className="flex flex-col justify-center">
          <div data-hero className="inline-flex w-fit items-center gap-2 rounded-md border border-brand/20 bg-brand/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-brand">
            <Sparkles className="size-4" aria-hidden />
            Exam-wise preparation platform
          </div>
          <h1 data-hero className="mt-5 max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            One exam coach for syllabus, planning, quizzes, and progress.
          </h1>
          <p data-hero className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Pick any competitive exam, build a detailed prep roadmap, schedule quizzes, and keep every dashboard filtered to the exam you are currently preparing.
          </p>
          <div data-hero className="mt-7 flex flex-wrap gap-3">
            <Link to="/register">
              <Button className="min-h-12 px-6">Start learning</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" className="min-h-12 px-6">I already have an account</Button>
            </Link>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Exam-wise context", "Prepared-topic quizzes", "Smart carry-forward"].map((item) => (
              <div key={item} data-hero className="rounded-md border border-brand/15 bg-white/90 px-4 py-3 text-sm font-black shadow-soft">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="relative min-h-[430px] sm:min-h-[500px]">
          <div className="absolute inset-x-0 top-10 mx-auto h-[350px] max-w-[520px] rounded-lg border border-slate-200 bg-white/95 shadow-soft sm:h-[420px]" />
          <div data-float className="absolute left-3 top-5 rounded-lg border border-brand/20 bg-white p-4 text-ink shadow-soft sm:left-8 sm:top-10 sm:p-5">
            <p className="text-xs font-black uppercase tracking-wide text-brand">Today</p>
            <h2 className="mt-2 text-xl font-black sm:text-2xl">Soil Science</h2>
            <p className="mt-1 text-sm text-slate-600">2.5h focused block</p>
          </div>
          <div data-float className="absolute right-3 top-28 rounded-lg border border-brand/15 bg-white p-4 shadow-soft sm:right-4 sm:p-5">
            <Target className="size-7 text-violet-600" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-slate-500">Readiness</p>
            <p className="text-3xl font-black">74%</p>
          </div>
          <div data-float className="absolute bottom-8 left-0 right-0 mx-auto w-[92%] max-w-xl rounded-lg border border-brand/15 bg-white p-4 shadow-soft sm:bottom-16 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {["Quiz generated", "Weak topics found", "Plan updated"].map((item) => (
                <div key={item} className="rounded-md bg-brand/10 p-3 text-sm font-black text-slate-800">{item}</div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <section className="mx-auto grid max-w-7xl gap-3 px-4 pb-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {features.map((feature) => (
          <article key={feature.title} data-feature className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <feature.icon className="size-6 text-brand" aria-hidden />
            <h2 className="mt-4 text-lg font-black">{feature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{feature.body}</p>
          </article>
        ))}
      </section>
      </div>
    </div>
  );
};
