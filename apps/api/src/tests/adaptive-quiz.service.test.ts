import { describe, expect, it } from "vitest";
import { AdaptiveQuizService } from "../services/adaptive-quiz.service.js";

describe("AdaptiveQuizService", () => {
  const service = new AdaptiveQuizService();

  it("increases difficulty when accuracy is above 85 percent", () => {
    expect(service.decideNextDifficulty("medium", 86)).toMatchObject({
      nextDifficulty: "hard"
    });
  });

  it("decreases difficulty when accuracy is below 50 percent", () => {
    expect(service.decideNextDifficulty("medium", 49)).toMatchObject({
      nextDifficulty: "easy"
    });
  });

  it("maintains difficulty between the thresholds", () => {
    expect(service.decideNextDifficulty("medium", 72)).toMatchObject({
      nextDifficulty: "medium"
    });
  });
});
