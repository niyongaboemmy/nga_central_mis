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
  owner: { id: number; name: string; regNumber: string | null; type: string; avatar: string | null };
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
}

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
  invite: (id: number, who: { userId?: number; regNumber?: string }) => api.post(`${B}/${id}/members`, who),
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
  exportUrl: (params: Record<string, unknown>, format: "csv" | "xlsx") => {
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
