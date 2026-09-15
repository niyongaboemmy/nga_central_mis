import { apiService } from "../services/api";

export interface LearningOutcomeActivity {
  id?: number;
  learning_outcome_id?: number;
  trainer_activities: string;
  learner_activities: string;
}

export interface LearningOutcomeResource {
  id?: number;
  learning_outcome_id?: number;
  resource_name: string;
}

export interface LearningOutcome {
  id?: number;
  lesson_id?: number;
  code: string;
  title: string;
  description: string;
  duration_minutes: number;
  activities: LearningOutcomeActivity[];
  resources: LearningOutcomeResource[];
}

export interface LessonSection {
  id?: number;
  lesson_id?: number;
  section_type: "Introduction" | "Development" | "Conclusion";
  trainer_activities: string;
  learner_activities: string;
  resources: string;
  duration_minutes: number;
}

export interface IndicativeContent {
  id?: number;
  lesson_id?: number;
  category: string;
  content: string;
}

export interface LessonAssignment {
  id?: number;
  lesson_id?: number;
  description: string;
}

export interface LessonEvaluation {
  id?: number;
  lesson_id?: number;
  teacher_notes: string;
  references: string;
  prepared_by: string;
  verified_by: string;
}

export interface LessonPlan {
  id?: number;
  entry_id: number;
  user_id: number;
  session_code: string;
  sector: string;
  trade: string;
  level: string;
  module_code: string;
  module_name: string;
  week: number;
  term: string;
  school_year: string;
  class_name: string;
  number_of_trainees: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
  instructor_name: string;
  big_question: string;
  total_duration_minutes: number;
  outcomes: LearningOutcome[];
  sections: LessonSection[];
  indicativeContent: IndicativeContent[];
  assignments: LessonAssignment[];
  evaluation: LessonEvaluation | null;
  created_at?: string;
}

export interface AILessonGenerationStatus {
  status: "loading" | "analyzing" | "structuring" | "saving" | "done" | "error";
  stepIndex: number;
  totalSteps: number;
  message: string;
  lessonId?: number;
  error?: string;
}

export const lessonPlanApi = {
  getByEntry: (entryId: number) =>
    apiService.get<LessonPlan[]>(`/lesson-plans/entry/${entryId}`),

  startAIGenerate: (
    entryId: number,
    sessionHours: number,
    lessonId?: number,
    lessonDate?: string,
  ) =>
    apiService.post<{ success: boolean; data: { jobId: string } }>(
      "/lesson-plans/ai-generate",
      {
        entry_id: entryId,
        lesson_id: lessonId,
        session_hours: sessionHours,
        lesson_date: lessonDate,
      },
    ),

  getAIGenerateStatus: (jobId: string) =>
    apiService.get<{ success: boolean; data: AILessonGenerationStatus }>(
      `/lesson-plans/ai-generate/${jobId}/status`,
    ),

  save: (data: Partial<LessonPlan>) => apiService.post("/lesson-plans", data),

  delete: (id: number) => apiService.delete(`/lesson-plans/${id}`),

  extract: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiService.post<{
      success: boolean;
      message: string;
      data: Partial<LessonPlan>;
    }>("/lesson-plans/extract", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
};
