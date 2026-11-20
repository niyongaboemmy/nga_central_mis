import api, { API_BASE_URL } from "../services/api";
import { getToken } from "../utils/auth";
import type { PreviewManifest } from "../lib/files/previewPlan";

/** Student side projects (backend routes/sideProjects.ts). */

export type Status = "IDEA" | "PLANNING" | "IN_PROGRESS" | "TESTING" | "COMPLETED" | "ON_HOLD";
/** The four working stages that have a planned window. */
export type Stage = "IDEA" | "PLANNING" | "IN_PROGRESS" | "TESTING";
export type ReviewState = "NONE" | "CHANGES_REQUESTED" | "AWAITING_VERIFICATION" | "VERIFIED";
export type Health = "ON_TRACK" | "STALE" | "OVERDUE" | "BLOCKED" | "DONE" | "IDLE" | "PAUSED";
export type DocType = "CONCEPT" | "SRS" | "IMPLEMENTATION_PLAN";
/** Classification (migration 132). Students' projects are always STUDENT. */
export type Kind = "STUDENT" | "DELIVERY_STUDIO" | "INDIVIDUAL";
export type LinkKind = "VIDEO" | "DESIGN" | "DOCS" | "STORE" | "OTHER";

export interface Category {
  id: number;
  slug: string;
  name: string;
  icon: string;
  color: string;
}

/** Teams, plan and tasks (migration 133). */
export type TeamMode = "PERSONAL" | "TEAM";
export type RoleKey = "LEAD" | "DEVELOPER" | "DESIGNER" | "TESTER" | "RESEARCHER" | "ANALYST" | "DOCUMENTER" | "OTHER";
export type PlanStatus = "BACKLOG" | "PLANNED" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE" | "CANCELLED";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE" | "CANCELLED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PlanItem {
  id: number;
  parentId: number | null;
  kind: "PHASE" | "FEATURE";
  title: string;
  description: string | null;
  status: PlanStatus;
  statusMode: "AUTO" | "MANUAL";
  priority: Priority;
  stage: Stage | null;
  ownerId: number | null;
  ownerName: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  sort: number;
  doneAt: string | null;
  statusChangedAt: string | null;
  /** Reports written against this item (migration 138). */
  reports?: number;
  lastReport?: string | null;
  reportedHours?: number;
}

export interface Task {
  id: number;
  projectId: number;
  planItemId: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeId: number | null;
  assigneeName: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  blockedReason: string | null;
  sort: number;
  startedAt: string | null;
  completedAt: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  createdBy: number | null;
  spentHours: number;
  overdue: boolean;
  /** Git (migration 139): the latest pull request naming this task, and its commit count. */
  pr?: { number: number; state: "OPEN" | "MERGED" | "CLOSED"; draft: boolean; reviewState: string | null; url: string } | null;
  commits?: number;
  projectTitle?: string;
  planItemTitle?: string;
}

export interface TaskDetail extends Task {
  history: Array<{ id: number; fromStatus: TaskStatus | null; toStatus: TaskStatus; note: string | null; at: string; actorId: number | null; actor: string }>;
  logs: Array<{ id: number; userId: number; name: string; workDate: string; hours: number; note: string | null; createdAt: string }>;
}

export interface PlanData {
  items: PlanItem[];
  tasks: Task[];
}

export interface PlanTemplate {
  key: string;
  label: string;
  categories: string[];
  phases: Array<{ title: string; stage: Stage; features: string[] }>;
}

export interface DeliveryKpis {
  total: number;
  byStatus: Record<TaskStatus, number>;
  open: number;
  done: number;
  overdue: number;
  blocked: number;
  avgCycleDays: number | null;
  medianCycleDays: number | null;
  avgLeadDays: number | null;
  onTimeRate: number | null;
  openEstimateHours: number;
}

export interface MemberReport {
  id: number;
  name: string;
  owner: boolean;
  roleKey: RoleKey;
  roleTitle: string | null;
  responsibilities: string | null;
  isManager: boolean;
  assigned: number;
  inProgress: number;
  inReview: number;
  blocked: number;
  todo: number;
  done: number;
  overdue: number;
  avgCycleDays: number | null;
  onTimeRate: number | null;
  openEstimateHours: number;
  hoursLogged: number;
  reports: number;
  lastReport: string | null;
}

export interface Delivery {
  kpis: DeliveryKpis & { unassigned: number; planItems: number; planDone: number };
  burndown: Array<{ date: string; scope: number; remaining: number }>;
  throughput: Array<{ week: string; done: number }>;
  statusTime: Array<{ status: TaskStatus; avgDays: number; samples: number }>;
  planByStatus: Partial<Record<PlanStatus, number>>;
  latePlan: Array<{ id: number; title: string; due: string; status: PlanStatus }>;
  members: MemberReport[];
}

export type CustomerKind = "PERSON" | "COMPANY" | "SCHOOL" | "NGO" | "GOVERNMENT" | "OTHER";
export interface Customer {
  id: number;
  name: string;
  kind: CustomerKind;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  description: string | null;
  logoAssetId: number | null;
  projects?: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string | null;
  archived: boolean;
}

export interface StageTiming {
  enteredAt: string | null;
  daysIn: number | null;
  plannedEnd: string | null;
  plannedDays: number | null;
  daysLeft: number | null;
  overrunDays: number;
}

export interface StageView {
  stage: Stage;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedDays: number | null;
  actualDays: number;
  state: "done" | "current" | "upcoming" | "skipped";
  enteredAt: string | null;
  daysIn: number | null;
  daysLeft: number | null;
  overrunDays: number;
}

export interface Period {
  stages: StageView[];
  onHoldDays: number;
  currentStage: Stage | "COMPLETED";
  paused: boolean;
  totalDays: number | null;
  daysLeftProject: number | null;
  elapsedPct: number | null;
  /** No start date: the provisional start the stage plan is drawn from. */
  assumedStart?: string | null;
}

export interface ReportFile {
  assetId: number;
  name: string;
  size: number;
}

export interface Report {
  id: number;
  did: string;
  nextSteps: string | null;
  blockers: string | null;
  mood: number | null;
  hours: number | null;
  stage: Status | null;
  workDate: string;
  createdAt: string;
  editedAt: string | null;
  authorId: number;
  author: string;
  files: ReportFile[];
  /** MANUAL, GIT (a submitted GitHub draft) or GIT_AUTO (submitted by the project's policy). */
  source?: "MANUAL" | "GIT" | "GIT_AUTO";
  /** The plan items / tasks this report covers (migration 138). */
  work?: ReportWork[];
}

export interface ReportWork {
  itemId: number;
  itemTitle: string;
  itemKind: "PHASE" | "FEATURE";
  phaseTitle: string | null;
  taskId: number | null;
  taskTitle: string | null;
  hours: number | null;
  status: string | null;
  evidence?: { commits: string[]; prs: number[] } | null;
  hoursSource?: "TYPED" | "GIT_ESTIMATE" | "EDITOR" | "COMMIT" | null;
}

/** One line of a report: a feature or a task, the hours spent and an optional new state. */
export interface ReportWorkInput {
  itemId?: number;
  taskId?: number;
  hours?: number | null;
  status?: string | null;
}

export interface Activity {
  since: string;
  days: number;
  activity: Array<{ date: string; reports: number; events: number; hours: number }>;
  stats: { activeDays: number; reports: number; hours: number; currentStreak: number; longestStreak: number };
}

export interface ProjectCard {
  id: number;
  title: string;
  status: Status;
  kind: Kind;
  boardPosition: number;
  reviewState: ReviewState;
  progress: number;
  health: Health;
  pausedFrom: Status | null;
  stage: StageTiming;
  teamMode?: TeamMode;
  customer?: { id: number; name: string; logoAssetId: number | null } | null;
  plan?: { total: number; done: number };
  tasks?: { open: number; done: number };
  milestones: { total: number; done: number };
  techTags: string[];
  githubUrl: string | null;
  accessUrl: string | null;
  coverAssetId: number | null;
  /** optional project logo (migration 133) */
  logoAssetId?: number | null;
  conceptPending: boolean;
  docs: Record<DocType, boolean>;
  mediaCount: number;
  commentCount: number;
  memberCount: number;
  category: Category | null;
  targetDate: string | null;
  lastActivityAt: string;
  createdAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  archivedAt: string | null;
  myRole?: "OWNER" | "MEMBER" | "INVITED";
  ownerName?: string;
}

export interface DocVersion {
  id: number;
  type: DocType;
  version: number;
  isCurrent: boolean;
  source: "UPLOAD" | "WRITTEN";
  assetId: number;
  name: string;
  ext: string;
  kind: string;
  size: number;
  previewStatus: string;
  createdAt: string;
  uploadedBy: string;
}

export interface Media {
  id: number;
  assetId: number;
  caption: string | null;
  sort: number;
  name: string;
  ext: string;
  kind: string;
  size: number;
  hasThumb: boolean;
  createdAt: string;
}

export interface ProjectDetail extends ProjectCard {
  /** Brief summary (40-400 characters) that opens the project; null on older or imported rows. */
  abstract: string | null;
  problemStatement: string;
  description: string | null;
  outcomeSummary: string | null;
  startDate: string | null;
  startedAt: string | null;
  owner: { id: number; name: string; regNumber: string | null; type: string; avatar: string | null; roleTitle?: string | null; responsibilities?: string | null };
  supervisor: { id: number; name: string } | null;
  verifiedBy: string | null;
  academicYear: { id: number; name: string } | null;
  class: { id: number; name: string; grade: string | null; program: string | null } | null;
  documents: Record<DocType, { current: DocVersion | null; versions: DocVersion[] }>;
  media: Media[];
  links: Array<{ id: number; kind: LinkKind; label: string; url: string }>;
  milestones: Array<{ id: number; title: string; dueDate: string | null; doneAt: string | null; done: boolean; sort: number }> & any;
  updates: Report[];
  period: Period;
  stays: Array<{ stage: Status; enteredAt: string; leftAt: string | null }>;
  comments: Array<{ id: number; kind: "COMMENT" | "CHANGES_REQUESTED" | "VERIFIED"; body: string; createdAt: string; authorId: number; author: string; authorType: string }>;
  events: Array<{ id: number; type: string; fromValue: string | null; toValue: string | null; note: string | null; createdAt: string; actorId: number | null; actor: string }>;
  members: Array<{ id: number; status: "INVITED" | "ACCEPTED"; name: string; regNumber: string | null; type: string; roleKey: RoleKey; roleTitle: string | null; responsibilities: string | null; isManager: boolean }>;
  teamMode: TeamMode;
  customerMode: "OWN" | "CUSTOMER";
  customerDetail: Customer | null;
  rights: { edit: boolean; owner: boolean; review: boolean; manageAny: boolean; supervisor: boolean; manage: boolean };
}

export interface MonitorRow extends ProjectCard {
  /** The owner (any user type; named `student` for history). */
  student: { id: number; name: string; regNumber: string | null; type: string; avatar: string | null };
  class: { id: number; name: string; gradeId: number; grade: string; programId: number; program: string } | null;
  year: { id: number; name: string } | null;
  supervisor: { id: number; name: string } | null;
  relation?: "SUPERVISOR" | "MEMBER" | null;
  lastReport?: string | null;
}

export interface StageInsight {
  stage: Stage;
  avgActualDays: number;
  avgPlannedDays: number | null;
  samples: number;
  now: number;
  overrunNow: number;
}

export interface AssignedResult {
  counts: { total: number; supervising: number; member: number; awaitingReview: number; overdue: number; stale: number; paused: number; completed: number };
  rows: MonitorRow[];
}

export interface Summary {
  depth: "summary" | "detail";
  generatedAt: string;
  totals: {
    projects: number;
    students: number;
    population: number;
    participation: number | null;
    studentOwners: number;
    studentProjects: number;
    staffProjects: number;
    byKind?: Record<Kind, number>;
    byStatus: Record<Status, number>;
    completedThisTerm: number;
    completedPreviousTerm: number;
    termLabel: string;
    awaitingVerification: number;
    verified: number;
    changesRequested: number;
    stale: number;
    overdue: number;
    blocked: number;
    onTrack: number;
    conceptPending: number;
    withGithub: number;
    withAccess: number;
    avgProgress: number;
  };
  months: Array<{ month: string; created: number; completed: number }>;
  weeks: Array<{ week: string; count: number }>;
  byClass: Array<{ classId: number | null; name: string; grade: string | null; students: number } & Record<Status, number>>;
  byCategory: Array<{ name: string; color: string; count: number }>;
  topTech: Array<{ tag: string; count: number }>;
  attention: MonitorRow[];
  recentCompleted: MonitorRow[];
  stages: {
    stages: StageInsight[];
    onHold: { now: number; avgDays: number };
    bottleneck: { stage: Stage; ratio: number } | null;
    stuck: MonitorRow[];
  };
  reporting: {
    reportsThisWeek: number;
    hoursThisWeek: number;
    projectsReportedThisWeek: number;
    workingProjects: number;
    quietCount: number;
    quiet: Array<MonitorRow & { lastReport: string | null; daysSinceReport: number | null }>;
  };
  delivery?: DeliveryKpis & { teamProjects: number; withPlan: number; planItems: number; planDone: number; atRisk: Array<{ id: number; title: string; overdue: number; blocked: number; open: number }> };
}

export interface Me {
  own: boolean;
  view: "summary" | "detail" | null;
  review: boolean;
  manageAny: boolean;
  supervising: number;
  /** may open the Assigned projects page (SIDE_PROJECTS_ASSIGNED) */
  assigned: boolean;
  /** may choose a project's classification (SIDE_PROJECTS_CLASSIFY, never a student) */
  classify?: boolean;
  /** "own": a student sees only their customers and their projects' customers */
  customers?: "all" | "own";
  /** may set a new project up from its documents with AI (SIDE_PROJECTS_AI_SETUP, never a student) */
  aiSetup?: boolean;
}

// ------------------------------------------------------------------ set up with AI (migration 140)
export type AiDocSlot = "CONCEPT" | "SRS" | "IMPLEMENTATION_PLAN" | "GALLERY" | "SKIP";
export interface AiSetupFile {
  id: string;
  name: string;
  size: number;
  kind: string | null;
  pages: number | null;
  chars: number;
  status: "READ" | "NO_TEXT" | "REFUSED";
  note: string | null;
}
export interface AiDraftTask { title: string; priority: Priority; estimateHours: number | null }
export interface AiDraftFeature { title: string; description: string; priority: Priority; estimateHours: number | null; tasks: AiDraftTask[] }
export interface AiDraftPhase { title: string; description: string; stage: Stage | null; features: AiDraftFeature[] }
export interface AiDraft {
  title: string;
  abstract: string;
  problemStatement: string;
  description: string;
  concept: { users: string; solution: string; impact: string };
  techTags: string[];
  categoryId: number | null;
  category: string;
  kind: "DELIVERY_STUDIO" | "INDIVIDUAL";
  customerName: string;
  githubUrl: string;
  accessUrl: string;
  startDate: string;
  targetDate: string;
  stageEnds: { IDEA: string; PLANNING: string; IN_PROGRESS: string } | null;
  startIn: "IDEA" | "PLANNING" | "IN_PROGRESS";
  documents: Array<{ fileId: string; name: string; slot: AiDocSlot; why: string }>;
  phases: AiDraftPhase[];
  questions: string[];
  assumptions: string[];
  summary: string;
}
export interface AiTurn { role: "user" | "ai"; text: string; at: string }
export interface AiDraftResult {
  draft: AiDraft;
  issues: Array<{ field: string; message: string }>;
  reply: string;
  turns: AiTurn[];
  provider: { name: string; label: string; model: string | null };
}
export interface AiProviders { auto: boolean; list: Array<{ name: string; label: string; ready: boolean }> }

export interface FilterOptions {
  years: Array<{ id: number; name: string; isCurrent: boolean }>;
  classes: Array<{ id: number; name: string; gradeId: number; grade: string; programId: number; program: string }>;
  categories: Category[];
  customers?: Array<{ id: number; name: string }>;
}

export interface ImportResult {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  rows: Array<{ line: number; regNumber: string; student: string | null; title: string; status: string; ok: boolean; errors: string[]; projectId?: number }>;
}

export interface ApiFailure {
  message: string;
  code?: string;
  field?: string;
}

/** The server's refusal as { message, code, field } (forms highlight `field`). */
export const failure = (e: unknown, fallback = "Something went wrong. Try again"): ApiFailure => {
  const d = (e as { response?: { data?: { message?: string; code?: string; field?: string } } })?.response?.data;
  return { message: d?.message || fallback, code: d?.code, field: d?.field };
};

const B = "/side-projects";
type Data<T> = { data: T };

export const fileUrl = (assetId: number, variant: "original" | "thumb" | "pdf" | "text" = "original", download = false) => {
  const t = getToken();
  const q = new URLSearchParams();
  if (variant !== "original") q.set("variant", variant);
  if (download) q.set("download", "1");
  if (t) q.set("token", t);
  return `${API_BASE_URL}${B}/files/${assetId}?${q.toString()}`;
};

const toForm = (fields: Record<string, unknown>, files: Record<string, File | File[] | null | undefined> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  for (const [k, f] of Object.entries(files)) {
    if (!f) continue;
    for (const one of Array.isArray(f) ? f : [f]) fd.append(k, one);
  }
  return fd;
};

type Progress = (pct: number) => void;

export interface ReportBody {
  did: string;
  nextSteps?: string;
  blockers?: string;
  mood?: number | null;
  workDate: string;
  hours?: number | null;
  work?: ReportWorkInput[];
}
/** Multipart config: the shared client defaults to JSON (axios would turn FormData into JSON and
 *  drop the files) and to a 10 s timeout, too short for uploads on school Wi-Fi. */
const onUp = (cb?: Progress) => ({
  timeout: 0,
  headers: { "Content-Type": "multipart/form-data" },
  ...(cb ? { onUploadProgress: (e: { loaded: number; total?: number }) => cb(e.total ? Math.round((e.loaded / e.total) * 100) : 0) } : {}),
});

export const sideProjectsApi = {
  me: () => api.get<Data<Me>>(`${B}/me`).then((r) => r.data.data),
  categories: () => api.get<Data<Category[]>>(`${B}/categories`).then((r) => r.data.data),
  tags: (q: string) => api.get<Data<string[]>>(`${B}/tags`, { params: { q } }).then((r) => r.data.data),
  /** Staff who may supervise; with a project, its owner and teammates are left out. */
  supervisors: (q: string, projectId?: number) =>
    api.get<Data<Array<{ id: number; name: string; type: string }>>>(`${B}/supervisors`, { params: { q, projectId } }).then((r) => r.data.data),
  /** Everyone active (team invites): students, staff, parents. */
  people: (q: string) => api.get<Data<Array<{ id: number; name: string; regNumber: string | null; type: string }>>>(`${B}/people`, { params: { q } }).then((r) => r.data.data),

  mine: (archived = false) => api.get<Data<ProjectCard[]>>(`${B}/mine`, { params: archived ? { archived: 1 } : {} }).then((r) => r.data.data),
  get: (id: number) => api.get<Data<ProjectDetail>>(`${B}/${id}`).then((r) => r.data.data),
  create: (fields: Record<string, unknown>, concept: File | null, progress?: Progress) =>
    api.post<Data<{ id: number }>>(B, toForm(fields, { concept }), onUp(progress)).then((r) => r.data.data),
  update: (id: number, body: Record<string, unknown>) => api.patch<Data<ProjectDetail>>(`${B}/${id}`, body).then((r) => r.data.data),
  transition: (id: number, body: { to: Status; outcomeSummary?: string; reason?: string; position?: number }) =>
    api.post<Data<{ from: Status; to: Status; reviewState: ReviewState }>>(`${B}/${id}/transition`, body).then((r) => r.data.data),
  order: (status: Status, ids: number[]) => api.patch(`${B}/board/order`, { status, ids }),
  archive: (id: number) => api.post(`${B}/${id}/archive`),
  restore: (id: number) => api.post(`${B}/${id}/restore`),
  remove: (id: number) => api.delete(`${B}/${id}`),

  uploadDocument: (id: number, type: DocType, file: File, progress?: Progress) =>
    api.post<Data<{ version: number }>>(`${B}/${id}/documents/${type.toLowerCase()}`, toForm({}, { file }), onUp(progress)).then((r) => r.data.data),
  uploadMedia: (id: number, files: File[], progress?: Progress) =>
    api.post<Data<{ ids: number[] }>>(`${B}/${id}/media`, toForm({}, { files }), onUp(progress)).then((r) => r.data.data),
  updateMedia: (id: number, mediaId: number, body: { caption?: string; cover?: boolean }) => api.patch(`${B}/${id}/media/${mediaId}`, body),
  orderMedia: (id: number, ids: number[]) => api.patch(`${B}/${id}/media/order`, { ids }),
  removeMedia: (id: number, mediaId: number) => api.delete(`${B}/${id}/media/${mediaId}`),
  manifest: (assetId: number) => api.get<Data<PreviewManifest>>(`${B}/files/${assetId}`, { params: { manifest: 1 } }).then((r) => r.data.data),
  blob: (assetId: number, variant: "original" | "pdf" | "text") =>
    api.get(`${B}/files/${assetId}`, { params: variant === "original" ? {} : { variant }, responseType: "blob" }).then((r) => r.data as Blob),

  addMilestone: (id: number, body: { title: string; dueDate?: string | null }) => api.post(`${B}/${id}/milestones`, body),
  updateMilestone: (id: number, mid: number, body: { title?: string; dueDate?: string | null; done?: boolean }) => api.patch(`${B}/${id}/milestones/${mid}`, body),
  removeMilestone: (id: number, mid: number) => api.delete(`${B}/${id}/milestones/${mid}`),
  orderMilestones: (id: number, ids: number[]) => api.patch(`${B}/${id}/milestones/order`, { ids }),
  addReport: (id: number, body: ReportBody, files: File[], progress?: Progress) =>
    api.post<Data<{ id: number }>>(`${B}/${id}/updates`, toForm(body as unknown as Record<string, unknown>, { files }), onUp(progress)).then((r) => r.data.data),
  editReport: (id: number, uid: number, body: ReportBody & { removeFiles?: number[] }, files: File[], progress?: Progress) =>
    api.patch(`${B}/${id}/updates/${uid}`, toForm(body as unknown as Record<string, unknown>, { files }), onUp(progress)),
  setBranding: (id: number, which: "cover" | "logo", file: File, progress?: Progress) =>
    api.post<Data<{ assetId: number }>>(`${B}/${id}/branding/${which}`, toForm({}, { file }), onUp(progress)).then((r) => r.data.data),
  clearBranding: (id: number, which: "cover" | "logo") => api.delete(`${B}/${id}/branding/${which}`),
  setTeamMode: (id: number, mode: TeamMode) => api.patch(`${B}/${id}/team`, { mode }),
  updateMember: (id: number, userId: number, body: { roleKey?: RoleKey; roleTitle?: string; responsibilities?: string; isManager?: boolean }) => api.patch(`${B}/${id}/members/${userId}`, body),
  plan: (id: number) => api.get<Data<PlanData>>(`${B}/${id}/plan`).then((r) => r.data.data),
  planTemplates: (id: number) => api.get<Data<{ suggested: string; templates: PlanTemplate[] }>>(`${B}/${id}/plan/templates`).then((r) => r.data.data),
  generatePlan: (id: number, template: string, append = false) => api.post<Data<{ created: number }>>(`${B}/${id}/plan/generate`, { template, append }).then((r) => r.data.data),
  createPlanItem: (id: number, body: Record<string, unknown>) => api.post<Data<{ id: number }>>(`${B}/${id}/plan/items`, body).then((r) => r.data.data),
  updatePlanItem: (id: number, itemId: number, body: Record<string, unknown>) => api.patch(`${B}/${id}/plan/items/${itemId}`, body),
  deletePlanItem: (id: number, itemId: number) => api.delete(`${B}/${id}/plan/items/${itemId}`),
  orderPlan: (id: number, parentId: number | null, ids: number[]) => api.patch(`${B}/${id}/plan/order`, { parentId, ids }),
  createTask: (id: number, body: Record<string, unknown>) => api.post<Data<{ id: number }>>(`${B}/${id}/tasks`, body).then((r) => r.data.data),
  updateTask: (id: number, taskId: number, body: Record<string, unknown>) => api.patch(`${B}/${id}/tasks/${taskId}`, body),
  moveTask: (id: number, taskId: number, to: TaskStatus, note?: string) => api.post<Data<{ status: TaskStatus }>>(`${B}/${id}/tasks/${taskId}/status`, { to, note }).then((r) => r.data.data),
  deleteTask: (id: number, taskId: number) => api.delete(`${B}/${id}/tasks/${taskId}`),
  task: (id: number, taskId: number) => api.get<Data<TaskDetail>>(`${B}/${id}/tasks/${taskId}`).then((r) => r.data.data),
  logWork: (id: number, taskId: number, body: { workDate: string; hours: number; note?: string }) => api.post(`${B}/${id}/tasks/${taskId}/logs`, body),
  deleteLog: (id: number, taskId: number, logId: number) => api.delete(`${B}/${id}/tasks/${taskId}/logs/${logId}`),
  delivery: (id: number) => api.get<Data<Delivery>>(`${B}/${id}/delivery`).then((r) => r.data.data),
  customers: (q = "", archived = false) => api.get<Data<Customer[]>>(`${B}/customers`, { params: { q, ...(archived ? { archived: 1 } : {}) } }).then((r) => r.data.data),
  createCustomer: (fields: Record<string, unknown>, logo: File | null) => api.post<Data<Customer>>(`${B}/customers`, toForm(fields, { logo }), onUp()).then((r) => r.data.data),
  updateCustomer: (id: number, fields: Record<string, unknown>, logo: File | null) => api.patch<Data<Customer>>(`${B}/customers/${id}`, toForm(fields, { logo }), onUp()).then((r) => r.data.data),
  removeCustomer: (id: number) => api.delete<Data<{ archived: boolean }>>(`${B}/customers/${id}`).then((r) => r.data.data),
  restoreCustomer: (id: number) => api.post(`${B}/customers/${id}/restore`),
  customerLogoUrl: (id: number, asset: number | null, variant: "thumb" | "original" = "thumb") => {
    const t = getToken();
    return `${API_BASE_URL}${B}/customers/${id}/logo?variant=${variant}&v=${asset ?? 0}${t ? `&token=${encodeURIComponent(t)}` : ""}`;
  },
  myTasks: () => api.get<Data<Task[]>>(`${B}/my-tasks`).then((r) => r.data.data),
  setKind: (id: number, kind: Kind) => api.patch<Data<{ kind: Kind }>>(`${B}/${id}/kind`, { kind }).then((r) => r.data.data),
  activity: (id: number, days = 182) => api.get<Data<Activity>>(`${B}/${id}/activity`, { params: { days } }).then((r) => r.data.data),
  updatePlan: (id: number, body: { startDate: string; targetDate: string; stagePlan?: string[] }) =>
    api.put<Data<{ plan: Array<{ stage: Stage; start: string; end: string }> }>>(`${B}/${id}/plan`, body).then((r) => r.data.data),
  removeUpdate: (id: number, uid: number) => api.delete(`${B}/${id}/updates/${uid}`),

  comment: (id: number, body: string) => api.post(`${B}/${id}/comments`, { body }),
  removeComment: (id: number, cid: number) => api.delete(`${B}/${id}/comments/${cid}`),
  invite: (id: number, who: { userId?: number; regNumber?: string; roleKey?: RoleKey; roleTitle?: string; responsibilities?: string }) => api.post(`${B}/${id}/members`, who),
  removeMember: (id: number, userId: number) => api.delete(`${B}/${id}/members/${userId}`),
  respondInvite: (id: number, accept: boolean) => api.post(`${B}/invitations/${id}`, { accept }),

  assigned: (params: Record<string, unknown> = {}) => api.get<Data<AssignedResult>>(`${B}/assigned`, { params }).then((r) => r.data.data),

  // Monitor
  options: () => api.get<Data<FilterOptions>>(`${B}/monitor/options`).then((r) => r.data.data),
  summary: (params: Record<string, unknown>) => api.get<Data<Summary>>(`${B}/monitor/summary`, { params }).then((r) => r.data.data),
  list: (params: Record<string, unknown>) =>
    api.get<Data<{ total: number; page: number; pageSize: number; rows: MonitorRow[] }>>(`${B}/monitor/projects`, { params }).then((r) => r.data.data),
  board: (params: Record<string, unknown>) => api.get<Data<MonitorRow[]>>(`${B}/monitor/board`, { params }).then((r) => r.data.data),
  staffGet: (id: number) => api.get<Data<ProjectDetail>>(`${B}/monitor/projects/${id}`).then((r) => r.data.data),
  /** The All projects report as a file (Excel / PDF / CSV), with the server's file name. */
  exportFile: async (params: Record<string, unknown>, format: "csv" | "xlsx" | "pdf") => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    let r;
    try {
      r = await api.get(`${B}/monitor/export`, { params: { ...clean, format }, responseType: "blob", timeout: 180_000 });
    } catch (e: any) {
      // A refusal comes back as a Blob too: read it so the message reaches the toast.
      const data = e?.response?.data;
      if (data && typeof data.text === "function") {
        try {
          e.response.data = JSON.parse(await data.text());
        } catch {
          /* not JSON */
        }
      }
      throw e;
    }
    const name = /filename="([^"]+)"/.exec(String(r.headers?.["content-disposition"] ?? ""))?.[1] ?? `projects-report.${format}`;
    return { blob: r.data as Blob, name };
  },
  exportUrl: (params: Record<string, unknown>, format: "csv" | "xlsx" | "pdf") => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    q.set("format", format);
    const t = getToken();
    if (t) q.set("token", t);
    return `${API_BASE_URL}${B}/monitor/export?${q.toString()}`;
  },
  review: (id: number, kind: "COMMENT" | "CHANGES_REQUESTED" | "VERIFIED", body?: string) => api.post(`${B}/${id}/review`, { kind, body }),
  setSupervisor: (id: number, supervisorId: number | null) => api.patch(`${B}/${id}/supervisor`, { supervisorId }),
  correctStatus: (id: number, to: Status, reason: string) => api.patch(`${B}/admin/projects/${id}/status`, { to, reason }),
  adminArchive: (id: number, archived: boolean) => api.post(`${B}/admin/projects/${id}/archive`, { archived }),
  adminDelete: (id: number) => api.delete(`${B}/admin/projects/${id}`),
  importSheet: (file: File, dryRun: boolean) =>
    api.post<Data<ImportResult>>(`${B}/admin/import`, toForm({}, { file }), { ...onUp(), params: { dryRun: dryRun ? 1 : 0 } }).then((r) => r.data.data),
  templateUrl: () => `${API_BASE_URL}${B}/import/template.csv?token=${encodeURIComponent(getToken() ?? "")}`,
};

// ─── Git-driven reporting (GIT_AUTOMATED_REPORTING_ANALYSIS.md) ───────────────

export interface GitSettings {
  automations: boolean;
  autoSubmitDays: number | null;
  ignoredPaths: string[];
  aiPolish: boolean;
  checks: boolean;
}

export interface GitStatus {
  enabled: boolean;
  /** "Connect GitHub" (OAuth) is offered only when the GitHub App is configured */
  oauth?: boolean;
  identity: { login: string; name: string | null; avatarUrl: string | null } | null;
  prefs: { aiPolish: boolean };
}

export interface GitProjectPanel {
  enabled: boolean;
  /** the NGA Projects app is configured (instant updates by webhook) */
  appEnabled?: boolean;
  /** the server can keep a private repository's token */
  vault?: boolean;
  /** the project's GitHub link, to connect in one click */
  suggestedUrl?: string | null;
  canManage: boolean;
  canEdit: boolean;
  taskKey: string | null;
  link: { fullName: string; htmlUrl: string; defaultBranch: string; pathPrefix: string | null; installationId: number | null; settings: GitSettings; lastEventAt: string | null;
    /** LINK: connected with its address and polled; APP: the GitHub App */
    mode?: "APP" | "LINK"; tokenHint?: string | null; syncedAt?: string | null; syncError?: string | null } | null;
  /** every connected repository (migration 142); `link` is the first */
  links?: GitLinkInfo[];
  settings: GitSettings;
  team: GitTeammate[];
  unclaimed: Array<{ login: string | null; email: string | null; name: string | null; commits: number; last: string }>;
  prs: Array<{ number: number; title: string; url: string; state: string; draft: boolean; reviewState: string | null; author: string | null; openedAt: string; mergedAt: string | null }>;
  commits: Array<{ sha: string; title: string; url: string | null; at: string; taskId: number | null; author: string | null }>;
  stats: { commits: number; tasks: number; last: string | null };
}

export interface GitTeammate {
  id: number;
  name: string;
  role?: "OWNER" | "MEMBER";
  login: string | null;
  avatarUrl: string | null;
  /** OAUTH: connected by them (only they change it); CLAIM: they typed it; LEAD: the lead typed it. */
  source?: "OAUTH" | "CLAIM" | "LEAD" | null;
  /** False while GitHub hasn't confirmed the account (linked from pushed commits during a rate limit). */
  verified?: boolean | null;
  commits?: number;
  lastCommit?: string | null;
  suggestion?: { login: string | null; email: string | null; name: string | null; commits: number } | null;
}

export interface GitLinkInfo {
  linkId: number;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  pathPrefix: string | null;
  installationId: number | null;
  mode: "APP" | "LINK";
  tokenHint: string | null;
  syncedAt: string | null;
  syncError: string | null;
  lastEventAt: string | null;
  commits: number;
}

export interface GitInstallation {
  id: number;
  account: string;
  type: string;
  suspended: boolean;
}

export interface GitRepo {
  id: number;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  projectId: number | null;
}

export interface GitTaskDev {
  key: string;
  branchName: string;
  command: string;
  connected: boolean;
  branches: Array<{ name: string; createdAt: string; lastCommitAt: string | null; deleted: boolean }>;
  prs: Array<{ number: number; title: string; url: string; state: string; draft: boolean; reviewState: string | null; openedAt: string; mergedAt: string | null }>;
  commits: Array<{ sha: string; title: string; url: string | null; at: string; author: string | null }>;
}

export interface DraftLine {
  key: string;
  taskId: number | null;
  itemId: number | null;
  title: string;
  taskStatus: string | null;
  suggestedTaskId: number | null;
  commits: Array<{ sha: string; title: string; url: string | null; at: string }>;
  prs: Array<{ number: number; title: string; state: string; url: string }>;
  hours: number | null;
  hoursSource: "GIT_ESTIMATE" | "EDITOR" | "COMMIT" | "TYPED" | null;
  hoursEdited?: boolean;
  include: boolean;
}

export interface ReportDraft {
  id: number;
  projectId: number;
  userId: number;
  from: string;
  to: string;
  did: string;
  nextSteps: string;
  blockers: string;
  lines: DraftLine[];
  hours: number | null;
  commitCount: number;
  edited: boolean;
  aiPolished: boolean;
  status: string;
  notifiedAt: string | null;
  projectTitle?: string;
}

/** AI rounds can take a minute on free tiers: no client timeout. */
const AI_CALL = { timeout: 0 };
export const aiSetupApi = {
  providers: () => api.get<Data<AiProviders>>(`${B}/ai-setup/providers`).then((r) => r.data.data),
  start: () => api.post<Data<{ id: string; maxFiles: number }>>(`${B}/ai-setup/sessions`).then((r) => r.data.data),
  addFile: (sid: string, file: File, progress?: Progress) =>
    api.post<Data<AiSetupFile>>(`${B}/ai-setup/sessions/${sid}/files`, toForm({}, { file }), onUp(progress)).then((r) => r.data.data),
  removeFile: (sid: string, fileId: string) => api.delete(`${B}/ai-setup/sessions/${sid}/files/${fileId}`),
  draft: (sid: string, body: { prompt: string; provider: string }) =>
    api.post<Data<AiDraftResult>>(`${B}/ai-setup/sessions/${sid}/draft`, body, AI_CALL).then((r) => r.data.data),
  refine: (sid: string, body: { message: string; provider: string; phases?: AiDraftPhase[] }) =>
    api.post<Data<AiDraftResult>>(`${B}/ai-setup/sessions/${sid}/refine`, body, AI_CALL).then((r) => r.data.data),
  applyPlan: (projectId: number, phases: AiDraftPhase[]) =>
    api.post<Data<{ phases: number; items: number; tasks: number }>>(`${B}/${projectId}/ai-plan`, { phases }, { timeout: 60_000 }).then((r) => r.data.data),
};

const G = "/side-projects/git";
export const gitApi = {
  status: () => api.get<Data<GitStatus>>(`${G}/status`).then((r) => r.data.data),
  connectUrl: (returnTo: string) => api.get<Data<{ url: string }>>(`${G}/connect-url`, { params: { returnTo } }).then((r) => r.data.data.url),
  disconnect: () => api.delete(`${G}/identity`),
  setPrefs: (body: { aiPolish: boolean }) => api.patch<Data<{ aiPolish: boolean }>>(`${G}/identity/prefs`, body).then((r) => r.data.data),
  project: (id: number) => api.get<Data<GitProjectPanel>>(`${G}/projects/${id}`).then((r) => r.data.data),
  installUrl: (id: number) => api.post<Data<{ url: string }>>(`${G}/projects/${id}/install-url`).then((r) => r.data.data.url),
  installations: () => api.get<Data<GitInstallation[]>>(`${G}/installations`).then((r) => r.data.data),
  repos: (installationId: number) => api.get<Data<GitRepo[]>>(`${G}/installations/${installationId}/repos`).then((r) => r.data.data),
  connect: (id: number, body: { installationId: number; repoId: number; pathPrefix?: string | null }) => api.post(`${G}/projects/${id}/connect`, body),
  /** Connect with the repository's address (no app); a private one needs a read-only token. */
  connectLink: (id: number, body: { url: string; token?: string; pathPrefix?: string | null }) =>
    api.post<Data<{ fullName: string; private: boolean; sync: { commits?: number; prs?: number; branches?: number; error?: string } }>>(`${G}/projects/${id}/connect-link`, body, { timeout: 120_000 }).then((r) => r.data.data),
  sync: (id: number) => api.post<Data<{ ok: true; commits?: number; prs?: number; branches?: number; live?: boolean; repos?: number; errors?: string[] }>>(`${G}/projects/${id}/sync`, {}, { timeout: 120_000 }).then((r) => r.data.data),
  /** "My GitHub username is …" */
  claimLogin: (login: string) => api.put<Data<{ login: string; name: string | null; avatarUrl: string | null }>>(`${G}/identity`, { login }).then((r) => r.data.data),
  /** "That's me" on an author the MIS couldn't match */
  /** The lead sets a teammate's GitHub username (or a person their own). */
  setTeammateLogin: (id: number, userId: number, login: string) =>
    api.put<Data<{ login: string; avatarUrl: string | null; verified: boolean; projects: number }>>(`${G}/projects/${id}/team/${userId}/github`, { login }).then((r) => r.data.data),
  clearTeammateLogin: (id: number, userId: number) => api.delete(`${G}/projects/${id}/team/${userId}/github`),
  claimAuthor: (id: number, body: { login?: string | null; email?: string | null }) => api.post(`${G}/projects/${id}/authors/claim`, body),
  /** Disconnect one repository (linkId) or all of them. */
  unlink: (id: number, linkId?: number) => api.delete(`${G}/projects/${id}/link`, { params: linkId ? { linkId } : {} }),
  settings: (id: number, body: Partial<GitSettings> & { taskKey?: string; pathPrefix?: string | null }) =>
    api.patch<Data<{ taskKey: string; settings: GitSettings }>>(`${G}/projects/${id}/settings`, body).then((r) => r.data.data),
  mapAuthor: (id: number, body: { login?: string | null; email?: string | null; userId?: number; ignore?: boolean }) => api.post(`${G}/projects/${id}/authors`, body),
  taskDev: (id: number, taskId: number) => api.get<Data<GitTaskDev>>(`${G}/projects/${id}/tasks/${taskId}`).then((r) => r.data.data),
  draft: (id: number, opts: { polish?: boolean } = {}) =>
    api.get<Data<{ draft: ReportDraft | null; canPolish: boolean }>>(`${G}/projects/${id}/draft`, { params: opts.polish === false ? { polish: 0 } : {} }).then((r) => r.data.data),
  editDraft: (draftId: number, body: { did?: string; nextSteps?: string; blockers?: string; lines?: Array<{ key: string; include?: boolean; hours?: number | null; taskId?: number | null }> }) =>
    api.patch<Data<ReportDraft>>(`${G}/drafts/${draftId}`, body).then((r) => r.data.data),
  submitDraft: (draftId: number, body: Record<string, unknown> = {}) => api.post<Data<{ reportId: number }>>(`${G}/drafts/${draftId}/submit`, body).then((r) => r.data.data),
  dismissDraft: (draftId: number) => api.post(`${G}/drafts/${draftId}/dismiss`),
  polishDraft: (draftId: number) => api.post<Data<ReportDraft>>(`${G}/drafts/${draftId}/polish`).then((r) => r.data.data),
  myDrafts: () => api.get<Data<ReportDraft[]>>(`${G}/drafts`).then((r) => r.data.data),
};
