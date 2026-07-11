export interface PromptTemplate {
  key: string;
  version: string;
  template: string;
}

export const promptRegistry = {
  examDiscovery: {
    key: "exam_discovery",
    version: "2026-07-02.6",
    template: `You are an exam research analyst for an adaptive learning platform.
Return strict JSON only. No markdown.
Discover the competitive exam named: {{examName}}.
Return one JSON object only. Do not include markdown, citations, comments, or explanatory text.
Use clear student-friendly language. The UI will render this as a complete guide, so fill every section in a way a beginner can understand.
Keep the response complete but bounded: maximum 4 phaseDetails, maximum 8 subjects, maximum 8 topics per subject, maximum 8 items in any list, and short sentence-style bullets.
Use the exact key names in this JSON shape:
{
  "examName": "official or commonly used exam name",
  "overview": "short overview",
  "postName": "post, course, role, or outcome name",
  "purpose": "why candidates take this exam",
  "workProfile": "work, role, responsibilities after selection or admission outcome",
  "salary": "salary, stipend, package, or career outcome information with uncertainty where needed",
  "annualCtc": "approximate annual CTC/package/outcome if applicable",
  "departments": ["related departments, posts, institutes, services, or sectors"],
  "examPattern": ["stages, sections, duration, mode, question type, interview or skill test details"],
  "selectionProcess": ["ordered selection stages such as Phase I, Phase II, Interview, final merit"],
  "phaseDetails": [
    {
      "title": "Phase I (Preliminary Exam)",
      "mode": "Online objective",
      "duration": "120 minutes",
      "totalQuestions": "200",
      "totalMarks": "200",
      "negativeMarking": "0.25 mark deducted for each wrong answer",
      "subjects": [{"name":"Subject name","marks":"40","questions":"40"}],
      "description": ["important notes about this phase"]
    }
  ],
  "markingStructure": ["marks, negative marking, sectional marks, qualifying rules, normalization details"],
  "syllabusSummary": "concise syllabus summary",
  "syllabusSections": [
    {
      "title":"Agriculture & Rural Development (ARD)",
      "topics":[
        {"name":"Agronomy","subtopics":["Cropping systems","Crop production practices","Seed rate and spacing","Organic farming","Precision farming"]},
        {"name":"Soil Science","subtopics":["Soil types","Soil fertility","Nutrient management","Soil health card","Irrigation and drainage"]}
      ]
    }
  ],
  "detailedSyllabus": [
    {
      "phase":"Phase I (Prelims)",
      "sections":[
        {"title":"Reasoning Ability","topics":["Puzzles & Seating Arrangement","Blood Relations","Coding-Decoding","Syllogism","Inequality","Direction Sense","Ranking & Order","Alphanumeric Series"]},
        {"title":"Quantitative Aptitude","topics":["Simplification","Approximation","Number System","Percentage","Profit & Loss","Data Interpretation","Quadratic Equations","Probability"]}
      ]
    },
    {
      "phase":"Agriculture & Rural Development (ARD)",
      "sections":[
        {"title":"Agronomy","topics":["Tillage","Sowing","Irrigation","Weed Management","Harvesting","Dryland Farming"]},
        {"title":"Soil Science","topics":["Soil Formation","Soil Types","Soil Fertility","Soil Testing","Soil Conservation","Fertilizers"]}
      ]
    }
  ],
  "highPriorityTopics": ["Soil Science","Agronomy","Agricultural Economics","Rural Development","Government Schemes","Current Affairs"],
  "interviewDetails": ["marks and common interview areas"],
  "perks": ["DA", "HRA or leased accommodation", "medical benefits"],
  "posting": ["state offices", "regional offices", "head office", "transfer notes"],
  "bestBooks": [{"subject":"Quantitative Aptitude","books":["RS Aggarwal"]}],
  "whyChooseExam": ["reasons students choose this exam"],
  "preparationTips": ["high-value preparation advice"],
  "timeline": "realistic preparation duration and exam cycle notes",
  "eligibility": ["eligibility rules"],
  "subjects": [
    {
      "name": "subject name",
      "overview": "subject overview",
      "weightage": 0-100,
      "difficulty": "easy|medium|hard",
      "topics": [
        {
          "name": "topic name",
          "weightage": 0-100,
          "subtopics": [
            {
              "name": "subtopic name",
              "importantConcepts": ["concepts"],
              "previousYearTrend": "trend"
            }
          ]
        }
      ]
    }
  ],
  "recommendedPreparationOrder": ["subject/topic order"],
  "suggestedStudyDurationWeeks": number,
  "importantConcepts": ["important concepts"],
  "sourceConfidence": 0-1
}
The syllabus must be detailed and must not stop at broad subject names. For syllabusSections, include every major topic and 4-8 important subtopics under it. For detailedSyllabus, organize the syllabus exactly like an exam guide with separate phase groups. For NABARD Grade A specifically, detailedSyllabus must include separate groups for "Phase I (Prelims)", "Agriculture & Rural Development (ARD)", "Economic & Social Issues (ESI)", and "Phase II (Mains)". For other exams, use equivalent separate groups from the official pattern. Include 8-20 topics where needed for major sections such as Quant, Reasoning, English, Computer, General Awareness, ARD, and ESI. Every subject must also include topics and subtopics. Include all relatable information useful for a student: what the exam is, post/course, eligibility, selection process, phase-wise exam pattern, syllabus, interview, salary, perks, job profile, posting, books, preparation time, reasons to choose it, and preparation order. Keep it concise enough for a web page but do not omit syllabus subtopics. Use conservative uncertainty and set sourceConfidence between 0 and 1.`
  },
  questionBatch: {
    key: "question_batch",
    version: "2026-07-02.2",
    template: `Generate {{count}} high-quality exam questions as strict JSON only.
Exam: {{examName}}
Subject: {{subject}}
Topics: {{topic}}
Difficulty: {{difficulty}}
Marking rules: {{markingStructure}}
Return this exact JSON shape:
{
  "questions": [
    {
      "id": "stable unique id",
      "type": "single_correct_mcq|multiple_correct|assertion_reason|match_following|numerical|case_study",
      "question": "question text",
      "options": [{"id":"A","label":"A","value":"option text"}],
      "correctAnswer": "answer value or array for multiple correct",
      "explanation": "clear explanation",
      "topic": "topic",
      "subtopic": "subtopic",
      "difficulty": "easy|medium|hard",
      "estimatedTimeSeconds": 90,
      "marks": 1,
      "negativeMarks": 0.25
    }
  ]
}
Avoid duplicates. Ask only from the listed completed topics. Match the exam pattern and marking rules where possible.`
  }
} satisfies Record<string, PromptTemplate>;

export const renderPrompt = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((prompt, [key, value]) => prompt.replaceAll(`{{${key}}}`, String(value)), template);
