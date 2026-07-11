export type PreparationLevel = "beginner" | "intermediate" | "advanced";
export type PreferredDifficulty = "easy" | "medium" | "hard" | "adaptive";
export type SubjectPriority = "high" | "medium" | "low";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionType =
  | "single_correct_mcq"
  | "multiple_correct"
  | "assertion_reason"
  | "match_following"
  | "numerical"
  | "case_study";
export type ConfidenceLevel = "guess" | "somewhat_sure" | "confident" | "very_confident";
export type QuizStatus = "scheduled" | "in_progress" | "completed" | "missed" | "cancelled";
export type UserRole = "student" | "admin" | "super_admin";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T;
  requestId: string;
}

export interface OnboardingInput {
  name: string;
  targetExam: string;
  targetYear: number;
  preferredLanguage: string;
  dailyStudyHours: number;
  preparationLevel: PreparationLevel;
  preferredDifficulty: PreferredDifficulty;
}

export interface ExamDiscoverySubject {
  name: string;
  overview: string;
  weightage: number;
  difficulty: QuestionDifficulty;
  topics: Array<{
    name: string;
    weightage: number;
    subtopics: Array<{
      name: string;
      importantConcepts: string[];
      previousYearTrend: string;
    }>;
  }>;
}

export interface ExamDiscoveryResult {
  examName: string;
  overview: string;
  postName: string;
  purpose: string;
  workProfile: string;
  salary: string;
  annualCtc: string;
  departments: string[];
  examPattern: string[];
  selectionProcess: string[];
  phaseDetails: Array<{
    title: string;
    mode: string;
    duration: string;
    totalQuestions: string;
    totalMarks: string;
    negativeMarking: string;
    subjects: Array<{
      name: string;
      marks: string;
      questions: string;
    }>;
    description: string[];
  }>;
  markingStructure: string[];
  syllabusSummary: string;
  syllabusSections: Array<{
    title: string;
    topics: Array<{
      name: string;
      subtopics: string[];
    }>;
  }>;
  detailedSyllabus: Array<{
    phase: string;
    sections: Array<{
      title: string;
      topics: string[];
    }>;
  }>;
  highPriorityTopics: string[];
  interviewDetails: string[];
  perks: string[];
  posting: string[];
  bestBooks: Array<{
    subject: string;
    books: string[];
  }>;
  whyChooseExam: string[];
  preparationTips: string[];
  timeline: string;
  eligibility: string[];
  subjects: ExamDiscoverySubject[];
  recommendedPreparationOrder: string[];
  suggestedStudyDurationWeeks: number;
  importantConcepts: string[];
  sourceConfidence: number;
  promptVersion: string;
}

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: QuestionOption[];
  correctAnswer: string | string[] | number | Record<string, string>;
  explanation: string;
  topic: string;
  subtopic: string;
  difficulty: QuestionDifficulty;
  estimatedTimeSeconds: number;
  marks: number;
  negativeMarks?: number;
}

export interface QuestionAttemptInput {
  questionId: string;
  answer: unknown;
  timeTakenSeconds: number;
  confidence: ConfidenceLevel;
  bookmarked: boolean;
  reviewLater: boolean;
}

export interface QuizReport {
  score: number;
  accuracy: number;
  averageTimeSeconds: number;
  readinessScore: number;
  strongSubjects: string[];
  weakSubjects: string[];
  weakTopics: string[];
  suggestions: string[];
}

export interface AdaptiveDecision {
  nextDifficulty: QuestionDifficulty;
  reason: string;
}
