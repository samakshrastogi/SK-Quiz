# SK Quiz Coach

SK Quiz Coach is an adaptive exam preparation platform designed for students preparing for competitive exams. It helps learners select target exams, understand their structure, prioritize syllabus subjects, generate a realistic dated study plan based on available time, schedule quizzes, attempt exam-pattern questions, and track overall readiness.

---

## Overview

| Area                | Product Details                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| **Product Name**    | SK Quiz Coach                                                                                       |
| **Primary User**    | Competitive exam aspirants (e.g., Civil Services, Engineering, Medical, Banking, or custom entries) |
| **Main Outcome**    | Date-wise personalized study schedules and adaptive topic quizzes                                   |
| **Exam Support**    | Dynamic setup for any exam configured by the user                                                   |
| **Personalization** | Tailored recommendations based on study pacing, section priorities, and topic accuracy              |
| **Key Portals**     | Student Workspace, Parent/Mentor View, Admin Dashboard                                              |

---

## Table of Contents

1. [User Roles](#user-roles)
2. [Student Flow](#student-flow)
3. [Exam Selection Flow](#exam-selection-flow)
4. [Study Planner Flow](#study-planner-flow)
5. [Quiz Flow](#quiz-flow)
6. [Mentor Flow](#mentor-flow)
7. [Profile and Analytics Flow](#profile-and-analytics-flow)
8. [Admin Flow](#admin-flow)
9. [Authentication Flow](#authentication-flow)
10. [Key Features](#key-features)

---

## User Roles

### Purpose

To customize the platform experience based on the permissions and objectives of the signed-in user.

### Flowchart

```mermaid
flowchart TD
  Visitor["Visitor"] --> Landing["Landing Page"]
  Landing --> Auth["Login or Register"]
  Auth --> Student["Student Workspace"]
  Student --> Profile["Profile & Analytics"]
  Student --> Quiz["Adaptive Quiz Session"]
  Student --> Planner["Study Planner Calendar"]
  Auth --> Admin["Admin Dashboard"]
```

---

## Student Flow

### Purpose

To guide a student from their first registration to their daily exam preparation activities.

### Flowchart

```mermaid
flowchart TD
  Register["Register & Verify Email"] --> SelectExam["Choose Target Exams"]
  SelectExam --> ViewGuide["View Dynamic Exam Guide"]
  ViewGuide --> Prioritize["Set Subject Priorities (High/Medium/Low)"]
  Prioritize --> SetupTime["Enter Study Hours (Daily/Weekly)"]
  SetupTime --> GetPlan["Generate Dated Study Plan"]
  GetPlan --> QuizTime["Set Daily Quiz Window"]
  QuizTime --> TakeQuiz["Take Quizzes on Prepared Topics"]
  TakeQuiz --> ReviewProgress["Review Analytics & Readiness Score"]
```

---

## Exam Selection Flow

### Purpose

To keep all sections of the workspace (study plan, quiz bank, progress metrics, mentor feedback) focused on the student's active exam goals.

### Flowchart

```mermaid
flowchart LR
  Exams["Selected Target Exams"] --> ActiveSelect["Header Exam Dropdown Selector"]
  ActiveSelect --> UpdatePlanner["Update Study Calendar"]
  ActiveSelect --> UpdateQuiz["Filter Prepared Topic Quizzes"]
  ActiveSelect --> UpdateMetrics["Update Readiness Score & Charts"]
  ActiveSelect --> UpdateMentor["Tailor Learning Recommendations"]
```

---

## Study Planner Flow

### Purpose

To generate a realistic date-by-date study calendar based on the student's available daily/weekly time rather than over-scheduling static topics.

### Flowchart

```mermaid
flowchart TD
  Config["Set Available Study Hours"] --> Topics["Fetch Prioritized Exam Syllabus"]
  Topics --> Split["Split Large Topics Into Daily Blocks"]
  Split --> AssignDates["Distribute Blocks to Calendar Dates"]
  AssignDates --> InsertReviews["Insert Automatic Review Days & Mocks"]
  InsertReviews --> ActivePlan["Active Study Plan"]
  ActivePlan --> IncompleteTasks["Reschedule / Carry-Forward Unfinished Work"]
```

---

## Quiz Flow

### Purpose

To test the student's knowledge using official exam-pattern questions solely covering the syllabus sections they have marked as prepared.

### Flowchart

```mermaid
flowchart TD
  QuizWindow["Quiz Time / Manual Start"] --> ScopeCheck["Filter Topics Marked 'Prepared'"]
  ScopeCheck --> GenQuestions["Assemble Exam-Pattern Question Set"]
  GenQuestions --> StartAttempt["Attempt Quiz (With Time Limits & Section Rules)"]
  StartAttempt --> SubmitAnswer["Submit Answer Sheets"]
  SubmitAnswer --> ReportCard["Review Score, Accuracy & Correct Explanations"]
  ReportCard --> UpdateStats["Update Profile Analytics & History Logs"]
```

---

## Mentor Flow

### Purpose

To provide personalized, AI-powered study coaching, revision strategies, and concept explanations based on the student's active exam, upcoming calendar tasks, and weak/strong topics.

### Flowchart

```mermaid
flowchart TD
  LoadContext["Load Student Context (Active Exam, Next Task, Weak/Strong Topics, Accuracy)"] --> Action{"User Action"}
  Action -->|Select Quick Prompt| SendQuery["Assemble Question & State Metadata"]
  Action -->|Type Custom Question| SendQuery
  SendQuery --> API["Post to /mentor/ask"]
  API --> Process{"AI Coach Processing"}
  Process -->|Success| DisplayResponse["Show Customized Advice & Study Tips"]
  Process -->|API Error| Fallback["Trigger Fallback Action Step (Based on Weak Topic/Next Task)"]
```

---

## Profile and Analytics Flow

### Purpose

To serve as the student's command center, tracking overall learning consistency, accuracy, and readiness forecasts.

### Flowchart

```mermaid
flowchart LR
  ActiveExam["Active Exam State"] --> FetchMetrics["Gather Total Hours, Quizzes & Accuracy"]
  FetchMetrics --> ShowKPIs["Display KPI Cards on Dashboard"]
  FetchMetrics --> DrawGraphs["Render Speed & Accuracy Trend Charts"]
  FetchMetrics --> ShowHistory["List Past Quiz Attempt Details"]
```

---

## Admin Flow

### Purpose

To give administrators full visibility into platform engagement, exam demand, and overall student activity.

### Flowchart

```mermaid
flowchart TD
  AdminAuth["Admin Login"] --> LoadConsole["Load Admin Console"]
  LoadConsole --> TrackUsers["Monitor User Registrations & Sessions"]
  LoadConsole --> DemandMetrics["Analyze Popular Exam Selections"]
  LoadConsole --> ProgressTracking["Review Study Completion & Quiz Success Rates"]
  LoadConsole --> RenderConsole["Display Consolidated Metric Charts & Data Tables"]
```

---

## Authentication Flow

### Purpose

To keep user session credentials secure, verify account registration, and automatically terminate idle sessions.

### Flowchart

```mermaid
flowchart TD
  Join["Sign Up"] --> VerifyOTP["Email OTP Verification"]
  VerifyOTP --> SetupUser["Verified Student Account"]
  SetupUser --> Login["Secure Login (Email or Google OAuth)"]
  Login --> ActiveSession["Establish App Session"]
  ActiveSession --> CheckIdle["48-Hour Inactivity Check"]
  CheckIdle -->|Idle| Terminate["Automatic Logout"]
  CheckIdle -->|Active| ActiveSession
```

---

## Key Features

- **Multi-Exam Capability:** Students can enroll in and target multiple exams concurrently, switching active views instantly.
- **Flexible Study Planner:** Planners dynamically adjust to input daily/weekly study hours, automatically break down heavy subjects, schedule mock reviews, and support rescheduling.
- **Adaptive Quiz Engine:** Quizzes only assess prepared topics and mimic real exam standards (like time limits, match-following structures, and negative marking).
- **Comprehensive Performance Reports:** Explanations and accuracy mapping are delivered immediately after quiz completion.
- **Student Dashboard & Progress Analytics:** Visual command center displaying completed study hours, quiz accuracy history, and exam readiness scores.
- **Interactive AI Mentor:** Context-aware study coaching that answers dynamic preparation questions based on active progress logs and schedules.
- **Secure Authentication:** Sessions are secured with Google Sign-in integration, OTP confirmations, and inactive session timeouts.
