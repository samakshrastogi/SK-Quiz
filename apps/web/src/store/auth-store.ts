import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole } from "@ai-quiz-coach/shared";

interface AuthState {
  accessToken?: string;
  refreshToken?: string;
  lastActivityAt?: number;
  user?: {
    id: string;
    role: UserRole;
  };
  setSession: (session: { accessToken: string; refreshToken: string; user: { id: string; role: UserRole } }) => void;
  touchActivity: () => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      setSession: (session) => set({ ...session, lastActivityAt: Date.now() }),
      touchActivity: () => set((state) => (state.accessToken ? { lastActivityAt: Date.now() } : state)),
      clearSession: () => set({ accessToken: undefined, refreshToken: undefined, user: undefined, lastActivityAt: undefined })
    }),
    { name: "sk-quiz-coach-auth" }
  )
);

export const AUTH_INACTIVITY_MS = 48 * 60 * 60 * 1000;
