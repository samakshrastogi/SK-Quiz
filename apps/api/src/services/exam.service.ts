import type { OnboardingInput } from "@ai-quiz-coach/shared";
import { ProfileModel, SubjectModel, SubtopicModel, TargetExamModel, TopicModel } from "../models/core.model.js";
import { ContentProviderService } from "../ai/ai-provider.service.js";

const normalizeExam = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "-");

const hasDetailedSyllabus = (sections: unknown[] | undefined) =>
  Boolean(
    sections?.some((section) => {
      const maybeSection = section as { topics?: unknown[] };
      return maybeSection.topics?.some(
        (topic) => typeof topic === "object" && topic !== null && Array.isArray((topic as { subtopics?: unknown[] }).subtopics) && Boolean((topic as { subtopics?: unknown[] }).subtopics?.length)
      );
    })
  );

const latestGuidePromptVersion = "2026-07-02.6";

const needsGuideRefresh = (exam: { phaseDetails?: unknown[]; syllabusSections?: unknown[]; detailedSyllabus?: unknown[]; highPriorityTopics?: unknown[]; bestBooks?: unknown[]; whyChooseExam?: unknown[]; promptVersion?: string | null } | null) => {
  if (!exam) return false;
  return (
    !exam.promptVersion?.includes(latestGuidePromptVersion) ||
    !exam.phaseDetails?.length ||
    !hasDetailedSyllabus(exam.syllabusSections) ||
    !exam.detailedSyllabus?.length ||
    !exam.highPriorityTopics?.length ||
    !exam.bestBooks?.length ||
    !exam.whyChooseExam?.length
  );
};

export class ExamService {
  constructor(private readonly contentProvider = new ContentProviderService()) {}

  async discoverExamDetails(examName: string, userId?: string) {
    const normalizedName = normalizeExam(examName);
    let exam = await TargetExamModel.findOne({ normalizedName });

    if (!exam || needsGuideRefresh(exam)) {
      const discovery = await this.contentProvider.discoverExam(examName, userId);
      const examPayload = {
        name: discovery.examName,
        normalizedName,
        overview: discovery.overview,
        postName: discovery.postName,
        purpose: discovery.purpose,
        workProfile: discovery.workProfile,
        salary: discovery.salary,
        annualCtc: discovery.annualCtc,
        departments: discovery.departments,
        examPattern: discovery.examPattern,
        selectionProcess: discovery.selectionProcess,
        phaseDetails: discovery.phaseDetails,
        markingStructure: discovery.markingStructure,
        syllabusSummary: discovery.syllabusSummary,
        syllabusSections: discovery.syllabusSections,
        detailedSyllabus: discovery.detailedSyllabus,
        highPriorityTopics: discovery.highPriorityTopics,
        interviewDetails: discovery.interviewDetails,
        perks: discovery.perks,
        posting: discovery.posting,
        bestBooks: discovery.bestBooks,
        whyChooseExam: discovery.whyChooseExam,
        preparationTips: discovery.preparationTips,
        timeline: discovery.timeline,
        eligibility: discovery.eligibility,
        recommendedPreparationOrder: discovery.recommendedPreparationOrder,
        suggestedStudyDurationWeeks: discovery.suggestedStudyDurationWeeks,
        importantConcepts: discovery.importantConcepts,
        sourceConfidence: discovery.sourceConfidence,
        promptVersion: discovery.promptVersion,
        discoveredByUserId: userId
      };

      if (exam) {
        const existingSubjects = await SubjectModel.find({ examId: exam._id }).select("_id");
        const existingSubjectIds = existingSubjects.map((subject) => subject._id);
        const existingTopics = await TopicModel.find({ subjectId: { $in: existingSubjectIds } }).select("_id");
        const existingTopicIds = existingTopics.map((topic) => topic._id);
        await SubtopicModel.deleteMany({ topicId: { $in: existingTopicIds } });
        await TopicModel.deleteMany({ subjectId: { $in: existingSubjectIds } });
        await SubjectModel.deleteMany({ examId: exam._id });
        exam = await TargetExamModel.findByIdAndUpdate(exam._id, examPayload, { new: true });
      } else {
        exam = await TargetExamModel.create(examPayload);
      }

      if (!exam) {
        throw new Error("Exam discovery failed");
      }

      for (const [subjectIndex, subject] of discovery.subjects.entries()) {
        const subjectDoc = await SubjectModel.create({
          examId: exam._id,
          name: subject.name,
          overview: subject.overview,
          weightage: subject.weightage,
          difficulty: subject.difficulty,
          userOrder: subjectIndex
        });

        for (const topic of subject.topics) {
          const topicDoc = await TopicModel.create({ subjectId: subjectDoc._id, name: topic.name, weightage: topic.weightage });
          await SubtopicModel.insertMany(topic.subtopics.map((subtopic) => ({ topicId: topicDoc._id, ...subtopic })));
        }
      }
    }

    const subjects = await SubjectModel.find({ examId: exam._id }).sort({ userOrder: 1, createdAt: 1 });
    const subjectDetails = await Promise.all(
      subjects.map(async (subject) => {
        const topics = await TopicModel.find({ subjectId: subject._id }).sort({ weightage: -1, createdAt: 1 });
        const topicDetails = await Promise.all(
          topics.map(async (topic) => {
            const subtopics = await SubtopicModel.find({ topicId: topic._id }).sort({ createdAt: 1 });
            return {
              name: topic.name,
              weightage: topic.weightage ?? 0,
              subtopics: subtopics.map((subtopic) => ({
                name: subtopic.name,
                importantConcepts: subtopic.importantConcepts ?? [],
                previousYearTrend: subtopic.previousYearTrend ?? ""
              }))
            };
          })
        );

        return {
          name: subject.name,
          overview: subject.overview ?? "",
          weightage: subject.weightage ?? 0,
          difficulty: subject.difficulty ?? "medium",
          topics: topicDetails
        };
      })
    );

    return {
      id: exam._id.toString(),
      examName: exam.name,
      overview: exam.overview ?? "",
      postName: exam.postName ?? "",
      purpose: exam.purpose ?? "",
      workProfile: exam.workProfile ?? "",
      salary: exam.salary ?? "",
      annualCtc: exam.annualCtc ?? "",
      departments: exam.departments ?? [],
      examPattern: exam.examPattern ?? [],
      selectionProcess: exam.selectionProcess ?? [],
      phaseDetails: exam.phaseDetails ?? [],
      markingStructure: exam.markingStructure ?? [],
      syllabusSummary: exam.syllabusSummary ?? "",
      syllabusSections: exam.syllabusSections ?? [],
      detailedSyllabus: exam.detailedSyllabus ?? [],
      highPriorityTopics: exam.highPriorityTopics ?? [],
      interviewDetails: exam.interviewDetails ?? [],
      perks: exam.perks ?? [],
      posting: exam.posting ?? [],
      bestBooks: exam.bestBooks ?? [],
      whyChooseExam: exam.whyChooseExam ?? [],
      preparationTips: exam.preparationTips ?? [],
      timeline: exam.timeline ?? "",
      eligibility: exam.eligibility ?? [],
      subjects: subjectDetails,
      recommendedPreparationOrder: exam.recommendedPreparationOrder ?? [],
      suggestedStudyDurationWeeks: exam.suggestedStudyDurationWeeks ?? 0,
      importantConcepts: exam.importantConcepts ?? [],
      sourceConfidence: exam.sourceConfidence ?? 0,
      promptVersion: exam.promptVersion ?? ""
    };
  }

  async completeOnboarding(userId: string, input: OnboardingInput) {
    const normalizedName = normalizeExam(input.targetExam);
    let exam = await TargetExamModel.findOne({ normalizedName });

    if (!exam) {
      await this.discoverExamDetails(input.targetExam, userId);
      exam = await TargetExamModel.findOne({ normalizedName });
    }

    if (!exam) {
      throw new Error("Exam discovery failed");
    }

    const profile = await ProfileModel.findOneAndUpdate(
      { userId },
      {
        name: input.name,
        targetExamId: exam._id,
        targetYear: input.targetYear,
        preferredLanguage: input.preferredLanguage,
        dailyStudyHours: input.dailyStudyHours,
        preparationLevel: input.preparationLevel,
        preferredDifficulty: input.preferredDifficulty
      },
      { new: true, upsert: true }
    );

    return { profile, exam };
  }
}
