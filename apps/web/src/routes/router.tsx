import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "../layouts/app-layout";
import { OnboardingPage } from "../features/onboarding/onboarding-page";
import { QuizPage } from "../features/quiz/quiz-page";
import { AnalyticsPage } from "../features/analytics/analytics-page";
import { MentorPage } from "../features/mentor/mentor-page";
import { PlannerPage } from "../features/planner/planner-page";
import { ForgotPasswordPage, LoginPage, RegisterPage } from "../features/auth/auth-pages";
import { DashboardPage } from "../features/profile/profile-page";
import { LandingPage } from "../features/landing/landing-page";

const rootRoute = createRootRoute({
  component: AppLayout
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: LandingPage });
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: "/profile", component: DashboardPage });
const onboardingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/onboarding", component: OnboardingPage });
const quizRoute = createRoute({ getParentRoute: () => rootRoute, path: "/quiz", component: QuizPage });
const analyticsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/analytics", component: AnalyticsPage });
const mentorRoute = createRoute({ getParentRoute: () => rootRoute, path: "/mentor", component: MentorPage });
const plannerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/planner", component: PlannerPage });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginPage });
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/register", component: RegisterPage });
const forgotPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/forgot-password", component: ForgotPasswordPage });

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    profileRoute,
    onboardingRoute,
    quizRoute,
    analyticsRoute,
    mentorRoute,
    plannerRoute,
    loginRoute,
    registerRoute,
    forgotPasswordRoute
  ])
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

