import type { UserRole } from "@ai-quiz-coach/shared";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        id: string;
        role: UserRole;
      };
    }
  }
}

export {};
