import api, { API_BASE_URL } from "../services/api";
import { getToken } from "../utils/auth";
import type { PreviewManifest } from "../lib/files/previewPlan";

/** Student side projects (backend routes/sideProjects.ts). */

export type Status = "IDEA" | "IN_PROGRESS" | "COMPLETED";
export type ReviewState = "NONE" | "CHANGES_REQUESTED" | "AWAITING_VERIFICATION" | "VERIFIED";
export type Health = "ON_TRACK" | "STALE" | "OVERDUE" | "BLOCKED" | "DONE" | "IDLE";
export type DocType = "CONCEPT" | "SRS" | "IMPLEMENTATION_PLAN";
export type LinkKind = "VIDEO" | "DESIGN" | "DOCS" | "STORE" | "OTHER";

export interface Category {
  id: number;
  slug: string;
  name: string;
  icon: string;
  color: string;
}

export interface ProjectCard {
  id: number;
  title: string;
  status: Status;
  boardPosition: number;
  reviewState: ReviewState;
  progress: number;
  health: Health;
  milestones: { total: number; done: number };
  techTags: string[];
  githubUrl: string | null;
  accessUrl: string | null;
  coverAssetId: number | null;
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
  updates: Array<{ id: number; did: string; nextSteps: string | null; blockers: string | null; mood: number | null; createdAt: string; authorId: number; author: string }>;
  comments: Array<{ id: number; kind: "COMMENT" | "CHANGES_REQUESTED" | "VERIFIED"; body: string; createdAt: string; authorId: number; author: string; authorType: string }>;
  events: Array<{ id: number; type: string; fromValue: string | null; toValue: string | null; note: string | null; createdAt: string; actorId: number | null; actor: string }>;
  members: Array<{ id: number; status: "INVITED" | "ACCEPTED"; name: string; regNumber: string | null; type: string }>;
  rights: { edit: boolean; owner: boolean; review: boolean; manageAny: boolean; supervisor: boolean };
}

export interface MonitorRow extends ProjectCard {
  /** The owner (any user type; named `student` for history). */
  student: { id: number; name: string; regNumber: string | null; type: string; avatar: string | null };
  class: { id: number; name: string; gradeId: number; grade: string; programId: number; program: string } | null;
  year: { id: number; name: string } | null;
  supervisor: { id: number; name: string } | null;
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
}

export interface Me {
  own: boolean;
  view: "summary" | "detail" | null;
  review: boolean;
  manageAny: boolean;
  supervising: number;
}

export interface FilterOptions {
  years: Array<{ id: number; name: string; isCurrent: boolean }>;
  classes: Array<{ id: number; name: string; gradeId: number; grade: string; programId: number; program: string }>;
  categories: Category[];
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
  supervisors: (q: string) => api.get<Data<Array<{ id: number; name: string; type: string }>>>(`${B}/supervisors`, { params: { q } }).then((r) => r.data.data),
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
  addUpdate: (id: number, body: { did: string; nextSteps?: string; blockers?: string; mood?: number | null }) => api.post(`${B}/${id}/updates`, body),
  removeUpdate: (id: number, uid: number) => api.delete(`${B}/${id}/updates/${uid}`),

  comment: (id: number, body: string) => api.post(`${B}/${id}/comments`, { body }),
  removeComment: (id: number, cid: number) => api.delete(`${B}/${id}/comments/${cid}`),
  invite: (id: number, who: { userId?: number; regNumber?: string }) => api.post(`${B}/${id}/members`, who),
  removeMember: (id: number, userId: number) => api.delete(`${B}/${id}/members/${userId}`),
  respondInvite: (id: number, accept: boolean) => api.post(`${B}/invitations/${id}`, { accept }),

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
