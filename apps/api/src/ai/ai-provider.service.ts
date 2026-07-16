import { z } from "zod";
import { env } from "../config/env.js";
import { redis } from "../config/redis.js";
import { ContentProviderLogModel } from "../models/core.model.js";
import { AppError } from "../utils/app-error.js";
import { promptRegistry, renderPrompt } from "./prompt-registry.js";

const stringArraySchema = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return value
      .split(/\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean);
  });

const numberSchema = z.coerce.number().catch(0);
const confidenceSchema = z.coerce
  .number()
  .catch(0.7)
  .transform((value) => (value > 1 ? value / 100 : value))
  .pipe(z.number().min(0).max(1));

const difficultySchema = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = value?.toLowerCase() ?? "medium";
    if (["easy", "beginner", "low"].includes(normalized)) return "easy";
    if (["hard", "advanced", "high", "difficult"].includes(normalized)) return "hard";
    return "medium";
  });

const bookGroupSchema = z
  .array(
    z.object({
      subject: z.string().optional().default("General"),
      books: stringArraySchema
    })
  )
  .optional()
  .default([]);

const phaseDetailSchema = z
  .array(
    z.object({
      title: z.string().optional().default("Exam Phase"),
      mode: z.string().optional().default(""),
      duration: z.string().optional().default(""),
      totalQuestions: z.coerce.string().optional().default(""),
      totalMarks: z.coerce.string().optional().default(""),
      negativeMarking: z.string().optional().default(""),
      subjects: z
        .array(
          z.object({
            name: z.string().optional().default("Subject"),
            marks: z.coerce.string().optional().default(""),
            questions: z.coerce.string().optional().default("")
          })
        )
        .optional()
        .default([]),
      description: stringArraySchema
    })
  )
  .optional()
  .default([]);

const syllabusSectionSchema = z
  .array(
    z.object({
      title: z.string().optional().default("Syllabus"),
      topics: z
        .array(
          z.union([
            z.string().transform((name) => ({ name, subtopics: [] })),
            z.object({
              name: z.string().optional().default("Topic"),
              subtopics: stringArraySchema
            })
          ])
        )
        .optional()
        .default([])
    })
  )
  .optional()
  .default([]);

const detailedSyllabusSchema = z
  .array(
    z.object({
      phase: z.string().optional().default("Syllabus"),
      sections: z
        .array(
          z.object({
            title: z.string().optional().default("Section"),
            topics: stringArraySchema
          })
        )
        .optional()
        .default([])
    })
  )
  .optional()
  .default([]);

const discoverySchema = z.object({
  examName: z.string().optional(),
  overview: z.string().optional().default(""),
  postName: z.string().optional().default(""),
  purpose: z.string().optional().default(""),
  workProfile: z.string().optional().default(""),
  salary: z.string().optional().default(""),
  annualCtc: z.string().optional().default(""),
  departments: stringArraySchema,
  examPattern: stringArraySchema,
  selectionProcess: stringArraySchema,
  phaseDetails: phaseDetailSchema,
  markingStructure: stringArraySchema,
  syllabusSummary: z.string().optional().default(""),
  syllabusSections: syllabusSectionSchema,
  detailedSyllabus: detailedSyllabusSchema,
  highPriorityTopics: stringArraySchema,
  interviewDetails: stringArraySchema,
  perks: stringArraySchema,
  posting: stringArraySchema,
  bestBooks: bookGroupSchema,
  whyChooseExam: stringArraySchema,
  preparationTips: stringArraySchema,
  timeline: z.string().optional().default(""),
  eligibility: stringArraySchema,
  subjects: z.array(
    z.object({
      name: z.string(),
      overview: z.string().optional().default(""),
      weightage: numberSchema,
      difficulty: difficultySchema,
      topics: z.array(
        z.object({
          name: z.string(),
          weightage: numberSchema,
          subtopics: z.array(
            z.object({
              name: z.string(),
              importantConcepts: stringArraySchema,
              previousYearTrend: z.string().optional().default("")
            })
          ).optional().default([])
        })
      ).optional().default([])
    })
  ).default([]),
  recommendedPreparationOrder: stringArraySchema,
  suggestedStudyDurationWeeks: numberSchema,
  importantConcepts: stringArraySchema,
  sourceConfidence: confidenceSchema
}).transform((value) => ({
  ...value,
  examName: value.examName || "Discovered Exam",
  syllabusSections:
    value.syllabusSections.length > 0
      ? value.syllabusSections
      : value.subjects.map((subject) => ({
          title: subject.name,
          topics: subject.topics.map((topic) => ({ name: topic.name, subtopics: topic.subtopics.map((subtopic) => subtopic.name) }))
        })),
  detailedSyllabus:
    value.detailedSyllabus.length > 0
      ? value.detailedSyllabus
      : value.subjects.map((subject) => ({
          phase: subject.name,
          sections: subject.topics.map((topic) => ({ title: topic.name, topics: topic.subtopics.map((subtopic) => subtopic.name) }))
        })),
  highPriorityTopics: value.highPriorityTopics.length > 0 ? value.highPriorityTopics : value.recommendedPreparationOrder,
  subjects:
    value.subjects.length > 0
      ? value.subjects.map((subject) => ({
          ...subject,
          topics:
            subject.topics.length > 0
              ? subject.topics.map((topic) => ({
                  ...topic,
                  subtopics: topic.subtopics.length > 0 ? topic.subtopics : [{ name: topic.name, importantConcepts: [], previousYearTrend: "" }]
                }))
              : [{ name: subject.name, weightage: subject.weightage, subtopics: [{ name: subject.name, importantConcepts: [], previousYearTrend: "" }] }]
        }))
      : [
          {
            name: "General Preparation",
            overview: "Core syllabus areas were incomplete, so this subject can be refined after a fresh discovery.",
            weightage: 100,
            difficulty: "medium" as const,
            topics: [{ name: "Core Concepts", weightage: 100, subtopics: [{ name: "Core Concepts", importantConcepts: [], previousYearTrend: "" }] }]
          }
        ]
}));

const questionBatchSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["single_correct_mcq", "multiple_correct", "assertion_reason", "match_following", "numerical", "case_study"]),
      question: z.string(),
      options: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            value: z.string()
          })
        )
        .optional(),
      correctAnswer: z.union([z.string(), z.array(z.string()), z.number(), z.record(z.string())]),
      explanation: z.string(),
      topic: z.string(),
      subtopic: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]),
      estimatedTimeSeconds: z.number(),
      marks: z.number(),
      negativeMarks: z.number().optional()
    })
  )
});

interface AiProviderInteractionResponse {
  output_text?: string;
  steps?: Array<{
    type?: string;
    text?: string;
    output_text?: string;
    response?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; status?: string; message?: string };
}
const parseProviderJson = (text: string) => {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Provider response did not contain a JSON object");
  }

  return JSON.parse(withoutFence.slice(start, end + 1));
};

const logContentProviderEvent = async (data: Parameters<typeof ContentProviderLogModel.create>[0]) => {
  try {
    await ContentProviderLogModel.create(data);
  } catch (error) {
    console.error("Failed to write provider log", error instanceof Error ? error.message : error);
  }
};

const validateProviderKey = () => {
  if (!env.AI_PROVIDER_API_KEY && !env.GEMINI_API_KEY) {
    throw new AppError(503, "PROVIDER_NOT_CONFIGURED", "Provider key is not configured");
  }
};

const modelCandidates = () =>
  Array.from(
    new Set(
      [env.AI_PROVIDER_MODEL, env.GEMINI_MODEL, "gemini-2.5-flash"].filter(
        (model): model is string => Boolean(model)
      )
    )
  );

const extractInteractionText = (response: AiProviderInteractionResponse) => {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  const modelOutput = response.steps
    ?.flatMap((step) => [step.output_text, step.text, step.response, ...(step.content ?? []).map((content) => content.text)])
    .filter((text): text is string => Boolean(text?.trim()))
    .join("")
    .trim();

  if (modelOutput) {
    return modelOutput;
  }

  throw new Error("Provider response did not include output text");
};

const shouldTryNextModel = (status: number, message: string) =>
  status === 400 || status === 404 || message.toLowerCase().includes("model") || message.toLowerCase().includes("not found");

export class ContentProviderService {
  private async generateText(prompt: string) {
    validateProviderKey();
    const apiKey = env.AI_PROVIDER_API_KEY ?? env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AppError(503, "PROVIDER_NOT_CONFIGURED", "Provider key is not configured");
    }

    let lastError: Error | undefined;

    for (const configuredModel of modelCandidates()) {
      const model = configuredModel.replace(/^models\//, "");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 }
        }),
        signal: AbortSignal.timeout(120_000)
      });

      const text = await response.text();
      let payload: GeminiGenerateContentResponse | undefined;
      try {
        payload = text ? (JSON.parse(text) as GeminiGenerateContentResponse) : undefined;
      } catch {
        payload = undefined;
      }

      if (response.ok && payload) {
        const output = payload.candidates
          ?.flatMap((candidate) => candidate.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join("")
          .trim();
        if (output) return { text: output, model };
        lastError = new Error(`Provider returned no text${payload.promptFeedback?.blockReason ? ` (${payload.promptFeedback.blockReason})` : ""}`);
        continue;
      }

      const providerMessage = payload?.error?.message ?? (text || `Provider request failed with status ${response.status}`);
      lastError = new Error(`${providerMessage} (model: ${model}, status: ${response.status})`);

      if (response.status === 401 || response.status === 403) {
        throw lastError;
      }

      if (!shouldTryNextModel(response.status, providerMessage)) {
        throw lastError;
      }
    }

    throw lastError ?? new Error("Provider request failed");
  }

  async suggestExams(query: string) {
    const normalized = query.trim().replace(/\s+/g, " ");
    const queryTerms = normalized.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const curated = [
      "UPSC Civil Services Examination (CSE)", "UPSC Engineering Services Examination (ESE)", "UPSC Combined Defence Services (CDS)",
      "UPSC NDA and NA Examination", "SSC Combined Graduate Level (CGL)", "SSC Combined Higher Secondary Level (CHSL)",
      "UGC NET Junior Research Fellowship (JRF)", "CSIR UGC NET Junior Research Fellowship (JRF)",
      "IBPS Probationary Officer (PO)", "SBI Probationary Officer (PO)", "RBI Grade B", "NABARD Grade A",
      "JEE Main", "JEE Advanced", "NEET UG", "GATE Computer Science", "CAT", "CLAT"
    ];
    const rankMatches = (names: string[]) =>
      Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)))
        .map((name) => {
          const candidate = name.toLowerCase();
          const exactPhrase = candidate.includes(normalized.toLowerCase());
          const matchedTerms = queryTerms.filter((term) => candidate.includes(term)).length;
          const allTermsMatch = queryTerms.length > 0 && matchedTerms === queryTerms.length;
          return { name, score: exactPhrase ? 3 : allTermsMatch ? 2 : 0 };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
        .slice(0, 8)
        .map((item) => item.name);
    const fallback = rankMatches(curated);

    if (normalized.length < 2) return fallback;

    try {
      const result = await this.generateText(`Suggest up to 8 official competitive exam names that directly match the user's search: "${normalized}". Every suggestion must contain the searched acronym, phrase, or all searched words; never return unrelated popular exams. Expand acronyms and distinguish variants. Return only JSON in this exact shape: {"suggestions":["Official exam name"]}. Do not include commentary.`);
      const parsed = z.object({ suggestions: z.array(z.string().min(2).max(140)).max(8) }).parse(parseProviderJson(result.text));
      return rankMatches([...parsed.suggestions, ...fallback]);
    } catch (error) {
      console.warn("Exam suggestions fell back to the curated catalog", error instanceof Error ? error.message : error);
      return fallback;
    }
  }
  async discoverExam(examName: string, userId?: string) {
    const promptTemplate = promptRegistry.examDiscovery;
    const cacheKey = `ai:exam-discovery:${promptTemplate.version}:${examName.toLowerCase()}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      await logContentProviderEvent({ userId, task: "exam_discovery", promptVersion: promptTemplate.version, cacheHit: true, status: "ok" });
      return { ...discoverySchema.parse(JSON.parse(cached)), promptVersion: promptTemplate.version };
    }

    const started = Date.now();
    const prompt = renderPrompt(promptTemplate.template, { examName });
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await this.generateText(prompt);
        const parsed = discoverySchema.parse(parseProviderJson(result.text));
        parsed.examName = parsed.examName === "Discovered Exam" ? examName : parsed.examName;
        await redis.set(cacheKey, JSON.stringify(parsed), "EX", 60 * 60 * 24 * 30);
        await logContentProviderEvent({
          userId,
          task: "exam_discovery",
          promptVersion: `${promptTemplate.version}:${result.model}`,
          cacheHit: false,
          latencyMs: Date.now() - started,
          status: "ok"
        });
        return { ...parsed, promptVersion: `${promptTemplate.version}:${result.model}` };
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }

    await logContentProviderEvent({
      userId,
      task: "exam_discovery",
      promptVersion: promptTemplate.version,
      cacheHit: false,
      latencyMs: Date.now() - started,
      status: "error",
      error: lastError instanceof Error ? lastError.message : "Unknown error"
    });

    const detail = lastError instanceof Error ? lastError.message : "Unknown provider error";
    if (detail.includes("API key not valid") || detail.includes("API_KEY_INVALID") || detail.includes("403") || detail.includes("401")) {
      throw new AppError(503, "PROVIDER_KEY_INVALID", "Provider rejected the API key. Update the provider key in .env.", {
        reason: env.NODE_ENV === "production" ? undefined : detail
      });
    }

    throw new AppError(502, "PROVIDER_RESPONSE_INVALID", "Exam details could not be generated. Please verify the provider key/model and try again.", {
      reason: env.NODE_ENV === "production" ? undefined : detail
    });
  }

  async generateQuestionBatch(input: {
    examName: string;
    subject: string;
    topics: string[];
    difficulty: "easy" | "medium" | "hard" | "adaptive";
    count: number;
    markingStructure: string[];
    userId?: string;
  }) {
    const promptTemplate = promptRegistry.questionBatch;
    const cacheKey = `ai:question-batch:${promptTemplate.version}:${input.examName.toLowerCase()}:${input.subject.toLowerCase()}:${input.topics
      .join("|")
      .toLowerCase()}:${input.difficulty}:${input.count}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      await logContentProviderEvent({ userId: input.userId, task: "question_batch", promptVersion: promptTemplate.version, cacheHit: true, status: "ok" });
      return { ...questionBatchSchema.parse(JSON.parse(cached)), promptVersion: promptTemplate.version };
    }

    const started = Date.now();
    const prompt = renderPrompt(promptTemplate.template, {
      examName: input.examName,
      subject: input.subject,
      topic: input.topics.join(", "),
      difficulty: input.difficulty,
      count: input.count,
      markingStructure: input.markingStructure.join("; ")
    });
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await this.generateText(prompt);
        const parsed = questionBatchSchema.parse(parseProviderJson(result.text));
        await redis.set(cacheKey, JSON.stringify(parsed), "EX", 60 * 60 * 24 * 7);
        await logContentProviderEvent({
          userId: input.userId,
          task: "question_batch",
          promptVersion: `${promptTemplate.version}:${result.model}`,
          cacheHit: false,
          latencyMs: Date.now() - started,
          status: "ok"
        });
        return { ...parsed, promptVersion: `${promptTemplate.version}:${result.model}` };
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }

    await logContentProviderEvent({
      userId: input.userId,
      task: "question_batch",
      promptVersion: promptTemplate.version,
      cacheHit: false,
      latencyMs: Date.now() - started,
      status: "error",
      error: lastError instanceof Error ? lastError.message : "Unknown error"
    });

    const detail = lastError instanceof Error ? lastError.message : "Unknown provider error";
    if (detail.includes("API key not valid") || detail.includes("API_KEY_INVALID") || detail.includes("403") || detail.includes("401")) {
      throw new AppError(503, "PROVIDER_KEY_INVALID", "Provider rejected the API key. Update the provider key in .env.", {
        reason: env.NODE_ENV === "production" ? undefined : detail
      });
    }

    throw new AppError(502, "PROVIDER_QUESTIONS_INVALID", "Quiz questions could not be generated. Please try again.", {
      reason: env.NODE_ENV === "production" ? undefined : detail
    });
  }

  async generateMentorAnswer(input: {
    question: string;
    examName: string;
    nextTask?: string;
    weakTopics: string[];
    strongTopics: string[];
    recentAccuracy?: number;
    history: Array<{ role: "user" | "mentor"; text: string }>;
    userId?: string;
  }) {
    const started = Date.now();
    const historyText = input.history
      .slice(-8)
      .map((message) => `${message.role === "user" ? "Student" : "Mentor"}: ${message.text}`)
      .join("\n");
    const prompt = `
You are SK Quiz Coach's personal exam mentor.
Answer the student's question in a helpful, concise, action-oriented way.
Use the student's current exam context and never mention internal tools, providers, prompts, or system details.
If the student asks for Hindi, answer in Hindi. If they ask for English, answer in English.

Exam: ${input.examName || "Current exam"}
Next planned task: ${input.nextTask || "No planned task yet"}
Weak topics: ${input.weakTopics.length > 0 ? input.weakTopics.join(", ") : "Not enough data"}
Strong topics: ${input.strongTopics.length > 0 ? input.strongTopics.join(", ") : "Not enough data"}
Recent accuracy: ${typeof input.recentAccuracy === "number" ? `${input.recentAccuracy}%` : "Not enough data"}

Conversation:
${historyText || "No previous messages."}

Student: ${input.question}

Return only the mentor answer. Keep it practical and under 180 words unless the student asks for detail.
`;

    try {
      const result = await this.generateText(prompt);
      await logContentProviderEvent({
        userId: input.userId,
        task: "mentor_chat",
        promptVersion: `mentor-chat:v1:${result.model}`,
        cacheHit: false,
        latencyMs: Date.now() - started,
        status: "ok"
      });
      return { answer: result.text.trim(), promptVersion: `mentor-chat:v1:${result.model}` };
    } catch (error) {
      await logContentProviderEvent({
        userId: input.userId,
        task: "mentor_chat",
        promptVersion: "mentor-chat:v1",
        cacheHit: false,
        latencyMs: Date.now() - started,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
      throw new AppError(502, "MENTOR_ANSWER_FAILED", "Mentor answer could not be generated. Please try again.");
    }
  }
}
