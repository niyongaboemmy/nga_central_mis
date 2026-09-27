import api from "../services/api";
import type { HomeOverview } from "../components/home/contract";
import type { AppSummaryResult } from "../components/home/appContract";

/**
 * Home aggregates every MIS module in one request -- heavier than the shared
 * client's 10s default, like the teacher overview (see api/dashboard.ts).
 */
export const HOME_OVERVIEW_TIMEOUT_MS = 30000;

export const getHomeOverview = async (params: {
  academic_year_id?: number;
  academic_term_id?: number;
  refresh?: boolean;
  as?: number;
}): Promise<HomeOverview> => {
  const { refresh, ...rest } = params;
  const response = await api.get<{ data: HomeOverview }>("/home/overview", {
    params: { ...rest, ...(refresh ? { refresh: 1 } : {}) },
    timeout: HOME_OVERVIEW_TIMEOUT_MS,
  });
  return response.data.data;
};

/** One other app's Home summary, relayed and checked by the MIS (never throws). */
export const getHomeAppSummary = async (
  source: string,
  body: { date?: string; academic_year_id?: number; lessons?: unknown[] },
): Promise<AppSummaryResult> => {
  try {
    const response = await api.post<{ data: AppSummaryResult }>(`/home/apps/${source}/summary`, body, {
      timeout: 15000,
    });
    return response.data.data;
  } catch {
    return { source: source as AppSummaryResult["source"], status: "unavailable", message: "Couldn't reach the MIS" };
  }
};
