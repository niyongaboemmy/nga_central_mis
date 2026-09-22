import { apiService } from "../services/api";

// ---------------------------------------------------------------- shared types

export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type SectionStatus = "HIDDEN" | "SCHEDULED" | "PUBLISHED";
export type CourseItemType =
  | "HEADER"
  | "LESSON_NOTE"
  | "SUBJECT_DOCUMENT"
  | "PAGE"
  | "VIDEO"
  | "LINK"
  | "TASKMENTOR_QUIZ"
  | "TASKMENTOR_ASSIGNMENT"
  | "KNOWLEDGE_CHECK"
  | "DISCUSSION";
export type CompletionRule = "NONE" | "VIEW" | "MARK_DONE" | "SUBMIT" | "MIN_SCORE";
export type ProgressState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type SectionState = "locked" | "unlocked" | "started" | "completed";

export interface CriterionChip {
  criteria_id: number;
  criteria_number: string;
  description: string;
  competency_id: number;
}

export interface Course {
  course_id: number;
  scheme_id: number;
  subject_id: number;
  class_group_id: number;
  academic_term_id: number;
  owner_user_id: number;
  title: string;
  description: string | null;
  cover_color: string | null;
  icon: string | null;
  status: CourseStatus;
  require_sequential_progress: 0 | 1;
  auto_publish_from_scheme: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface CourseHeader {
  course: Course;
  subject: { subject_id: number; name: string; code: string | null; color: string | null };
  class_group: { class_group_id: number; name: string };
  term: { academic_term_id: number; name: string | null; start_date: string | null; end_date: string | null };
  teacher: { user_id: number; name: string };
}

export interface ItemRef {
  status?: string | null;
  file_name?: string | null;
  page_count?: number | null;
  mime_type?: string | null;
  file_size?: number | null;
  owner_user_id?: number | null;
  missing?: boolean;
}

export interface CourseItem {
  item_id: number;
  section_id: number;
  item_type: CourseItemType;
  ref_id: number | null;
  title: string;
  description: string | null;
  external_url: string | null;
  position: number;
  indent: number;
  is_published: 0 | 1;
  is_required: 0 | 1;
  completion_rule: CompletionRule;
  min_score_pct: number | null;
  estimated_minutes: number | null;
  due_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  criteria: CriterionChip[];
  ref: ItemRef | null;
  /** Builder payloads only. */
  content_json?: any;
}

export interface CourseSection {
  section_id: number;
  course_id: number;
  scheme_entry_id: number | null;
  competency_id: number | null;
  title: string;
  summary: string | null;
  position: number;
  status: SectionStatus;
  unlock_at: string | null;
  requirement_type: "ALL" | "ONE";
  week_number: string | null;
  start_date: string | null;
  end_date: string | null;
  entry_status: string | null;
  competency_title: string | null;
  element_number: number | null;
  /** Target criteria for the week, from the scheme of work. */
  criteria: CriterionChip[];
  items: CourseItem[];
}

export interface BuilderCourse extends CourseHeader {
  sections: CourseSection[];
}

// ---------------------------------------------------------------- learner types

export interface LearnerItem extends CourseItem {
  state: ProgressState;
  completed_at: string | null;
  best_score_pct: number | null;
  seconds_spent: number;
  last_position: any;
  locked: boolean;
}

export interface LearnerCriterion extends CriterionChip {
  state: ProgressState;
  unplanned: boolean;
}

export interface LearnerSection extends Omit<CourseSection, "items"> {
  items: LearnerItem[];
  criteria_progress: LearnerCriterion[];
  state: SectionState;
  required_total: number;
  required_done: number;
  is_current_week: boolean;
  lock_reason: string | null;
}

export interface CourseSummary {
  percent: number;
  required_total: number;
  required_done: number;
  overdue_count: number;
  due_soon: { item_id: number; title: string; due_at: string; item_type: CourseItemType }[];
  current_section: { section_id: number; title: string; state: SectionState } | null;
  next_item: {
    item_id: number;
    title: string;
    item_type: CourseItemType;
    estimated_minutes: number | null;
    section_id: number;
    state: ProgressState;
  } | null;
  resume_item: { item_id: number; title: string; item_type: CourseItemType } | null;
  sections_completed: number;
  sections_total: number;
  near_goal: { section_id: number; title: string; remaining: number }[];
  criteria_total: number;
  criteria_covered: number;
}

export interface SectionCoverage {
  section_id: number;
  title: string;
  status: SectionStatus;
  element_number: number | null;
  competency_title: string | null;
  targets: CriterionChip[];
  covered: CriterionChip[];
  gaps: CriterionChip[];
  extra: CriterionChip[];
  has_check: boolean;
  items: number;
}

export interface CourseCoverage {
  course_id: number;
  targets_total: number;
  targets_covered: number;
  coverage_pct: number;
  curriculum_total: number;
  curriculum_covered: number;
  curriculum_pct: number;
  weeks_without_check: number;
  sections: SectionCoverage[];
  elements: {
    competency_id: number;
    element_number: number;
    title: string;
    total: number;
    planned: number;
    covered: number;
    live: number;
    criteria: { criteria_id: number; criteria_number: string; description: string; planned: boolean; covered: boolean; live: boolean }[];
  }[];
}

export interface JourneyResult {
  added: { note_id: number; title: string; criteria_ids: number[] }[];
  still_missing: CriterionChip[];
  has_check: boolean;
  coverage: SectionCoverage;
}

export interface LearnerCourse extends CourseHeader {
  sections: LearnerSection[];
  summary: CourseSummary;
}

export interface LearnerCourseCard extends CourseSummary {
  course_id: number;
  title: string;
  description: string | null;
  icon: string | null;
  cover_color: string | null;
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  class_group_name: string;
  term_name: string | null;
  teacher_name: string;
  published_sections: number;
  last_activity_at: string | null;
}

export interface ItemNeighbour {
  item_id: number;
  title: string;
  item_type: CourseItemType;
  locked: boolean;
  section_id: number;
}

export interface OpenedItem {
  item: LearnerItem;
  just_completed: boolean;
  content: any;
  section: { section_id: number; title: string; state: SectionState };
  course: { course_id: number; title: string; subject_name: string; cover_color: string | null; icon: string | null };
  prev: ItemNeighbour | null;
  next: ItemNeighbour | null;
  locked: boolean;
}

export interface MarkDoneResult {
  state: ProgressState;
  completed_at: string | null;
  just_completed: boolean;
  section_just_completed: boolean;
  section: { section_id: number; title: string; state: SectionState; criteria: CriterionChip[] };
  summary: CourseSummary;
}

export interface PickerNote {
  note_id: number;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  source: string;
  page_count: number | null;
  user_id: number;
  class_group_id: number | null;
  scheme_entry_id: number | null;
  updated_at: string;
  is_mine: boolean;
  placed_in_section_id: number | null;
}

export interface PickerDocument {
  document_id: number;
  original_name: string;
  mime_type: string;
  file_size: number;
  file_extension: string;
  description: string | null;
  competency_id: number | null;
  category_name: string | null;
  updated_at: string;
  placed_in_section_id: number | null;
}

export interface CurriculumOutcomePick {
  competency_id: number;
  element_number: number;
  title: string;
  criteria: { criteria_id: number; criteria_number: string; description: string }[];
}

export interface CourseProbe {
  course_id: number;
  status: CourseStatus;
  title: string;
  section_count: number;
  published_sections: number;
  item_count: number;
}

export interface MyCourseRow extends Course {
  subject_name: string;
  subject_code: string | null;
  subject_color: string | null;
  class_group_name: string;
  term_name: string | null;
  section_count: number;
  published_sections: number;
}

export interface MySchemeRow {
  scheme_id: number;
  validation_status: "PENDING" | "APPROVED" | "REJECTED";
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  subject_color: string | null;
  class_group_name: string;
  term_name: string | null;
  academic_year_id: number;
  entries: number;
  course_id: number | null;
  course_status: CourseStatus | null;
}

type Data<T> = { data: T };

// ---------------------------------------------------------------- client

export const elearningApi = {
  // Learner
  myCourses: () => apiService.get<Data<LearnerCourseCard[]>>("/elearning/my/courses"),
  myCourse: (courseId: number) => apiService.get<Data<LearnerCourse>>(`/elearning/my/courses/${courseId}`),
  openItem: (itemId: number) => apiService.get<Data<OpenedItem>>(`/elearning/my/items/${itemId}`),
  heartbeat: (itemId: number, seconds: number, position?: unknown) =>
    apiService.post(`/elearning/my/items/${itemId}/heartbeat`, { seconds, position }),
  markDone: (itemId: number) => apiService.post<Data<MarkDoneResult>>(`/elearning/my/items/${itemId}/done`),
  itemFileUrl: (itemId: number, download = false) =>
    `/elearning/my/items/${itemId}/file${download ? "?download=1" : ""}`,
  itemFileBlob: (itemId: number) => apiService.get<Blob>(`/elearning/my/items/${itemId}/file`, { responseType: "blob" }),
  sectionForDate: (subjectId: number, classGroupId: number, date: string) =>
    apiService.get<Data<{ course_id: number; section_id: number; title: string } | null>>("/elearning/my/section-for-date", {
      params: { subject_id: subjectId, class_group_id: classGroupId, date },
    }),

  // Builder
  myBuiltCourses: () => apiService.get<Data<MyCourseRow[]>>("/elearning/courses/mine"),
  mySchemes: (academicYearId?: number | null) =>
    apiService.get<Data<MySchemeRow[]>>("/elearning/courses/schemes", { params: { academic_year_id: academicYearId || undefined } }),
  probeScheme: (schemeId: number) => apiService.get<Data<CourseProbe | null>>(`/elearning/courses/by-scheme/${schemeId}`),
  createFromScheme: (schemeId: number) => apiService.post<Data<BuilderCourse>>(`/elearning/courses/from-scheme/${schemeId}`),
  builder: (courseId: number) => apiService.get<Data<BuilderCourse>>(`/elearning/courses/${courseId}`),
  updateCourse: (
    courseId: number,
    patch: Partial<Pick<Course, "title" | "description" | "status" | "require_sequential_progress" | "auto_publish_from_scheme" | "cover_color" | "icon">>,
  ) => apiService.patch<Data<BuilderCourse>>(`/elearning/courses/${courseId}`, patch),
  reseed: (courseId: number) => apiService.post<Data<BuilderCourse & { created: number }>>(`/elearning/courses/${courseId}/reseed`),
  createSection: (courseId: number, body: { title: string; summary?: string; status?: SectionStatus }) =>
    apiService.post<Data<BuilderCourse & { section_id: number }>>(`/elearning/courses/${courseId}/sections`, body),
  updateSection: (
    sectionId: number,
    patch: Partial<Pick<CourseSection, "title" | "summary" | "status" | "unlock_at" | "requirement_type">>,
  ) => apiService.patch<Data<BuilderCourse>>(`/elearning/sections/${sectionId}`, patch),
  deleteSection: (sectionId: number) => apiService.delete<Data<BuilderCourse>>(`/elearning/sections/${sectionId}`),
  reorderSections: (courseId: number, sectionIds: number[]) =>
    apiService.put<Data<BuilderCourse>>(`/elearning/courses/${courseId}/sections/order`, { section_ids: sectionIds }),
  createItem: (sectionId: number, body: Record<string, unknown>) =>
    apiService.post<Data<BuilderCourse & { item_id: number }>>(`/elearning/sections/${sectionId}/items`, body),
  updateItem: (itemId: number, patch: Record<string, unknown>) =>
    apiService.patch<Data<BuilderCourse>>(`/elearning/items/${itemId}`, patch),
  deleteItem: (itemId: number) => apiService.delete<Data<BuilderCourse>>(`/elearning/items/${itemId}`),
  reorderItems: (sectionId: number, itemIds: number[]) =>
    apiService.put<Data<BuilderCourse>>(`/elearning/sections/${sectionId}/items/order`, { item_ids: itemIds }),
  setItemCriteria: (itemId: number, criteriaIds: number[]) =>
    apiService.put<Data<BuilderCourse>>(`/elearning/items/${itemId}/criteria`, { criteria_ids: criteriaIds }),
  pickNotes: (courseId: number) => apiService.get<Data<PickerNote[]>>(`/elearning/courses/${courseId}/pickers/lesson-notes`),
  pickDocuments: (courseId: number) =>
    apiService.get<Data<PickerDocument[]>>(`/elearning/courses/${courseId}/pickers/subject-documents`),
  coverage: (courseId: number, basePath = "/elearning/courses") => apiService.get<Data<CourseCoverage>>(`${basePath}/${courseId}/coverage`),
  buildJourney: (sectionId: number) => apiService.post<Data<JourneyResult>>(`/elearning/sections/${sectionId}/build-journey`),
  progressReportUrl: (courseId: number) => `/elearning/courses/${courseId}/report.csv`,
  prerequisites: (courseId: number) => apiService.get<Data<Record<string, number[]>>>(`/elearning/courses/${courseId}/prerequisites`),
  setPrerequisites: (sectionId: number, requiresSectionIds: number[]) =>
    apiService.put(`/elearning/sections/${sectionId}/prerequisites`, { requires_section_ids: requiresSectionIds }),
  pickCriteria: (courseId: number) =>
    apiService.get<Data<CurriculumOutcomePick[]>>(`/elearning/courses/${courseId}/pickers/criteria`),
};

/** Learner routes — kept in one place so deep links from notifications, calendar and TM agree. */
export const learnerRoutes = {
  home: "/my-learning",
  me: "/my-learning/me",
  course: (courseId: number, sectionId?: number) =>
    `/my-learning/courses/${courseId}${sectionId ? `?section=${sectionId}` : ""}`,
  item: (courseId: number, itemId: number) => `/my-learning/courses/${courseId}/items/${itemId}`,
};

export const builderRoutes = {
  list: "/elearning/courses",
  build: (courseId: number, tab?: "content" | "insights" | "settings") =>
    `/elearning/courses/${courseId}/build${tab && tab !== "content" ? `?tab=${tab}` : ""}`,
};
