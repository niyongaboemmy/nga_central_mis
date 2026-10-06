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

type Envelope<T> = { success: boolean; message?: string; code?: string; data: T };

export const desktopToolsApi = {
  games: () => api.get<Envelope<GamesAdmin>>("/desktop/tools/settings/games"),
  saveGames: (settings: GameSettings) => api.put<Envelope<{ settings: GameSettings }>>("/desktop/tools/settings/games", settings),
};

export const apiError = (error: unknown, fallback = "Something went wrong — please try again") => {
  const e = error as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || fallback;
};
