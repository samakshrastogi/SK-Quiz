import mongoose, { Schema } from "mongoose";

const timestamps = { timestamps: true, versionKey: false as const };

export const UserModel = mongoose.model(
  "User",
  new Schema(
    {
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String },
      skCentralUserId: { type: String, unique: true, sparse: true, index: true },
      role: { type: String, enum: ["student", "admin", "super_admin"], default: "student" },
      emailVerifiedAt: { type: Date },
      lastLoginAt: { type: Date },
      lastActivityAt: { type: Date },
      refreshTokenFamilies: [{ tokenHash: String, expiresAt: Date, createdAt: Date }]
    },
    timestamps
  )
);

export const AuthOtpModel = mongoose.model(
  "AuthOtp",
  new Schema(
    {
      email: { type: String, required: true, lowercase: true, trim: true, index: true },
      purpose: { type: String, enum: ["verify_email", "reset_password"], required: true, index: true },
      otpHash: { type: String, required: true },
      expiresAt: { type: Date, required: true, index: true },
      consumedAt: Date,
      attempts: { type: Number, default: 0 }
    },
    timestamps
  )
);

export const AuthActivityModel = mongoose.model(
  "AuthActivity",
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
      email: { type: String, lowercase: true, trim: true, index: true },
      event: { type: String, enum: ["sk_central_login", "return_login", "logout"], required: true, index: true },
      provider: { type: String, enum: ["sk-central"], default: "sk-central" },
      metadata: Schema.Types.Mixed
    },
    timestamps
  )
);

export const ProfileModel = mongoose.model(
  "Profile",
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
      name: { type: String, required: true },
      avatarUrl: String,
      avatarInitials: String,
      targetExamId: { type: Schema.Types.ObjectId, ref: "TargetExam" },
      targetYear: Number,
      preferredLanguage: { type: String, default: "English" },
      dailyStudyHours: Number,
      preparationLevel: { type: String, enum: ["beginner", "intermediate", "advanced"] },
      preferredDifficulty: { type: String, enum: ["easy", "medium", "hard", "adaptive"] },
      xp: { type: Number, default: 0 },
      coins: { type: Number, default: 0 },
      level: { type: Number, default: 1 },
      streak: { type: Number, default: 0 }
    },
    timestamps
  )
);

export const TargetExamModel = mongoose.model(
  "TargetExam",
  new Schema(
    {
      name: { type: String, required: true, index: true },
      normalizedName: { type: String, required: true, unique: true },
      overview: String,
      postName: String,
      purpose: String,
      workProfile: String,
      salary: String,
      annualCtc: String,
      departments: [String],
      examPattern: [String],
      selectionProcess: [String],
      phaseDetails: [Schema.Types.Mixed],
      markingStructure: [String],
      syllabusSummary: String,
      syllabusSections: [Schema.Types.Mixed],
      detailedSyllabus: [Schema.Types.Mixed],
      highPriorityTopics: [String],
      interviewDetails: [String],
      perks: [String],
      posting: [String],
      bestBooks: [Schema.Types.Mixed],
      whyChooseExam: [String],
      preparationTips: [String],
      timeline: String,
      eligibility: [String],
      recommendedPreparationOrder: [String],
      suggestedStudyDurationWeeks: Number,
      importantConcepts: [String],
      sourceConfidence: Number,
      promptVersion: String,
      discoveredByUserId: { type: Schema.Types.ObjectId, ref: "User" }
    },
    timestamps
  )
);

export const SubjectModel = mongoose.model(
  "Subject",
  new Schema(
    {
      examId: { type: Schema.Types.ObjectId, ref: "TargetExam", required: true, index: true },
      name: { type: String, required: true },
      overview: String,
      weightage: Number,
      difficulty: { type: String, enum: ["easy", "medium", "hard"] },
      userPriority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
      userOrder: { type: Number, default: 0 },
      isFavorite: { type: Boolean, default: false }
    },
    timestamps
  )
);

export const TopicModel = mongoose.model(
  "Topic",
  new Schema(
    {
      subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
      name: { type: String, required: true },
      weightage: Number
    },
    timestamps
  )
);

export const SubtopicModel = mongoose.model(
  "Subtopic",
  new Schema(
    {
      topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
      name: { type: String, required: true },
      importantConcepts: [String],
      previousYearTrend: String
    },
    timestamps
  )
);

export const QuestionBankModel = mongoose.model(
  "QuestionBank",
  new Schema(
    {
      examId: { type: Schema.Types.ObjectId, ref: "TargetExam", required: true, index: true },
      subjectId: { type: Schema.Types.ObjectId, ref: "Subject", index: true },
      topicId: { type: Schema.Types.ObjectId, ref: "Topic", index: true },
      subtopicId: { type: Schema.Types.ObjectId, ref: "Subtopic", index: true },
      type: { type: String, required: true },
      question: { type: String, required: true },
      options: [{ id: String, label: String, value: String }],
      correctAnswer: { type: Schema.Types.Mixed, required: true },
      explanation: { type: String, required: true },
      difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
      estimatedTimeSeconds: Number,
      marks: Number,
      negativeMarks: Number,
      contentHash: { type: String, unique: true },
      promptVersion: String,
      aiProvider: String
    },
    timestamps
  )
);

export const QuizSessionModel = mongoose.model(
  "QuizSession",
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
      examId: { type: Schema.Types.ObjectId, ref: "TargetExam", required: true },
      status: { type: String, enum: ["scheduled", "in_progress", "completed", "missed", "cancelled"], default: "in_progress" },
      questionIds: [{ type: Schema.Types.ObjectId, ref: "QuestionBank" }],
      currentIndex: { type: Number, default: 0 },
      startedAt: Date,
      completedAt: Date,
      score: Number,
      report: Schema.Types.Mixed
    },
    timestamps
  )
);

export const QuestionAttemptModel = mongoose.model(
  "QuestionAttempt",
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
      quizSessionId: { type: Schema.Types.ObjectId, ref: "QuizSession", required: true, index: true },
      questionId: { type: Schema.Types.ObjectId, ref: "QuestionBank", required: true },
      answer: Schema.Types.Mixed,
      isCorrect: Boolean,
      timeTakenSeconds: Number,
      confidence: { type: String, enum: ["guess", "somewhat_sure", "confident", "very_confident"] },
      bookmarked: Boolean,
      reviewLater: Boolean
    },
    timestamps
  )
);

export const AnalyticsModel = mongoose.model("Analytics", new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", index: true }, metrics: Schema.Types.Mixed }, timestamps));
export const OnboardingStateModel = mongoose.model(
  "OnboardingState",
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
      sessionId: { type: String, index: true },
      state: { type: Schema.Types.Mixed, default: {} }
    },
    timestamps
  )
);
export const StudyPlanModel = mongoose.model("StudyPlan", new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", index: true }, plan: Schema.Types.Mixed, generatedBy: String }, timestamps));
export const RevisionQueueModel = mongoose.model("RevisionQueue", new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", index: true }, questionId: { type: Schema.Types.ObjectId, ref: "QuestionBank" }, dueAt: Date, intervalDays: Number }, timestamps));
export const ScheduledQuizModel = mongoose.model("ScheduledQuiz", new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", index: true }, subjectId: Schema.Types.ObjectId, topicId: Schema.Types.ObjectId, difficulty: String, questionCount: Number, durationMinutes: Number, scheduledAt: Date, repeat: String, status: String }, timestamps));
export const NotificationModel = mongoose.model("Notification", new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User", index: true }, title: String, body: String, readAt: Date, deliverAt: Date, channel: String }, timestamps));
export const LeaderboardModel = mongoose.model("Leaderboard", new Schema({ period: String, entries: [{ userId: Schema.Types.ObjectId, score: Number, rank: Number }] }, timestamps));
export const AchievementModel = mongoose.model("Achievement", new Schema({ key: { type: String, unique: true }, title: String, description: String, xp: Number, coinReward: Number }, timestamps));
export const ContentProviderLogModel = mongoose.model("ContentProviderLog", new Schema({ userId: Schema.Types.ObjectId, promptVersion: String, task: String, tokenUsage: Schema.Types.Mixed, latencyMs: Number, cacheHit: Boolean, status: String, error: String }, timestamps));
export const PromptVersionModel = mongoose.model("PromptVersion", new Schema({ key: String, version: String, template: String, schema: Schema.Types.Mixed, active: Boolean }, timestamps));
export const SettingModel = mongoose.model("Setting", new Schema({ key: { type: String, unique: true }, value: Schema.Types.Mixed }, timestamps));
