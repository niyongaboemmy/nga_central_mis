import api from "../services/api";

/** NGA Desktop tools: the school's game settings (backend services/desktop/games.ts). */
export interface GameSettings {
  enabled: boolean;
  disabled: string[];
  dailyBudgetMin: number;
  sessionCapMin: number;
  cooldownMin: number;
  quietHours: [string, string] | null;
  staffBudgetMin: number | null;
  igisoro: { approved: boolean; variant: string | null; approvedBy: number | null; approvedAt: string | null };
}

export interface GamesUsage {
  from: string;
  to: string;
  games: Array<{ game: string; minutes: number; players: number }>;
  players: number;
  minutes: number;
}

export interface GamesAdmin {
  settings: GameSettings;
  usage: GamesUsage;
  games: string[];
  igisoroVariants: string[];
  canApproveIgisoro: boolean;
}

export interface GameOverride {
  id: number;
  userId: number;
  name: string;
  kind: "block" | "extend";
  extraMin: number | null;
  reason: string;
  endsAt: string;
  by: string;
  createdAt: string;
}

export interface TutorSettings { enabled: boolean; dailyCap: number; schoolDailyPool: number | null; requireConsent: boolean }
export interface TutorEval { provider: string; model: string | null; prompts: number; answered: number; leaked: number; noLeakPct: number; passed: boolean; runAt: string }
export interface TutorAdmin {
  settings: TutorSettings;
  conversations: TutorConversation[];
  cache: { entries: number; hits: number };
  allowanceToday: number;
  evals: TutorEval[];
  evalRunning: boolean;
  passMark: number;
  providers: string[];
}
export interface TutorConversation { id: string; userId: number; name: string; messages: number; flagged: number; startedAt: string; lastAt: string; firstQuestion: string; reasons: string | null }
export interface TutorMessage { id: number; role: "student" | "tutor"; text: string; provider: string | null; model: string | null; verdict: { gives_final_answer?: boolean; does_the_work?: boolean; unsafe?: boolean; reason?: string; unchecked?: boolean } | null; flagged: boolean; flagReason: string | null; at: string }

type Envelope<T> = { success: boolean; message?: string; code?: string; data: T };

export const desktopToolsApi = {
  games: () => api.get<Envelope<GamesAdmin>>("/desktop/tools/settings/games"),
  saveGames: (settings: GameSettings) => api.put<Envelope<{ settings: GameSettings }>>("/desktop/tools/settings/games", settings),
  tutor: (params: { flagged?: boolean; days?: number }) =>
    api.get<Envelope<TutorAdmin>>("/desktop/tools/settings/tutor", { params: { flagged: params.flagged ? "1" : undefined, days: params.days } }),
  runTutorEvals: () => api.post<Envelope<{ started: boolean; running: boolean }>>("/desktop/tools/settings/tutor/evals/run"),
  family: () => api.get<Envelope<{ requireConsent: boolean; enabled: boolean; dailyCap: number; children: Array<{ id: number; name: string; granted: boolean | null }> }>>("/desktop/tools/family/tutor"),
  setConsent: (studentId: number, granted: boolean) => api.put<Envelope<{ studentId: number; granted: boolean }>>("/desktop/tools/family/tutor", { studentId, granted }),
  saveTutor: (s: TutorSettings) => api.put<Envelope<{ settings: TutorSettings }>>("/desktop/tools/settings/tutor", s),
  tutorConversation: (id: string) => api.get<Envelope<{ messages: TutorMessage[] }>>(`/desktop/tools/settings/tutor/conversations/${id}`),
  overrides: () => api.get<Envelope<{ overrides: GameOverride[] }>>("/desktop/tools/settings/games/overrides"),
  findStudents: (q: string) => api.get<Envelope<{ students: Array<{ id: number; name: string; className: string | null }> }>>("/desktop/tools/settings/games/students", { params: { q } }),
  addOverride: (body: { userId: number; kind: "block" | "extend"; extraMin?: number; reason: string; days: number }) =>
    api.post<Envelope<GameOverride>>("/desktop/tools/settings/games/overrides", body),
  revokeOverride: (id: number) => api.post<Envelope<{ revoked: boolean }>>(`/desktop/tools/settings/games/overrides/${id}/revoke`),
};

export const apiError = (error: unknown, fallback = "Something went wrong — please try again") => {
  const e = error as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || fallback;
};
