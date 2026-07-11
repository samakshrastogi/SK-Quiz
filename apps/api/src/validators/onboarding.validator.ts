import { z } from "zod";

export const examDiscoveryRequestSchema = z.object({
  examName: z.string().min(2).max(120)
});

export const onboardingStateSchema = z.object({
  state: z.record(z.unknown())
});

export const onboardingSchema = z.object({
  name: z.string().min(2).max(80),
  targetExam: z.string().min(2).max(120),
  targetYear: z.coerce.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 10),
  preferredLanguage: z.string().min(2).max(40),
  dailyStudyHours: z.coerce.number().min(0.5).max(16),
  preparationLevel: z.enum(["beginner", "intermediate", "advanced"]),
  preferredDifficulty: z.enum(["easy", "medium", "hard", "adaptive"])
});
