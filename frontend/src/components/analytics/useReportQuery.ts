import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Report filters live in the URL (plan §14): every view is linkable and bookmarkable.
 * Dates are Kigali calendar days (YYYY-MM-DD), matching the server's day buckets.
 */
export type Gran = "day" | "week" | "month";

export interface ReportState {
  from: string;
  to: string;
  gran: Gran;
  compare: "" | "prev" | "yoy";
  app: string[];
  aud: "both" | "user" | "visitor";
  type: string[];
  program: string[];
  grade: string[];
  classGroup: string[];
  preset: string;
}

/** Today in Kigali (UTC+2, no DST). */
export const kigaliToday = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export const PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: "today", label: "Today", range: () => [kigaliToday(), kigaliToday()] },
  { key: "yesterday", label: "Yesterday", range: () => [addDays(kigaliToday(), -1), addDays(kigaliToday(), -1)] },
  { key: "7d", label: "Last 7 days", range: () => [addDays(kigaliToday(), -6), kigaliToday()] },
  { key: "28d", label: "Last 28 days", range: () => [addDays(kigaliToday(), -27), kigaliToday()] },
  { key: "90d", label: "Last 90 days", range: () => [addDays(kigaliToday(), -89), kigaliToday()] },
  {
    key: "week",
    label: "This week",
    range: () => {
      const t = kigaliToday();
      const dow = (new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7;
      return [addDays(t, -dow), t];
    },
  },
  { key: "month", label: "This month", range: () => [`${kigaliToday().slice(0, 7)}-01`, kigaliToday()] },
];

const listOf = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function useReportQuery(defaults: { preset?: string; gran?: Gran } = {}) {
  const [params, setParams] = useSearchParams();
  const state: ReportState = useMemo(() => {
    const presetKey = params.get("preset") ?? (params.get("from") ? "custom" : defaults.preset ?? "28d");
    const preset = PRESETS.find((p) => p.key === presetKey);
    const [pf, pt] = preset ? preset.range() : [params.get("from") ?? addDays(kigaliToday(), -27), params.get("to") ?? kigaliToday()];
    return {
      from: preset ? pf : params.get("from") ?? pf,
      to: preset ? pt : params.get("to") ?? pt,
      gran: ((params.get("gran") as Gran) || defaults.gran || "day") as Gran,
      compare: (params.get("compare") as ReportState["compare"]) || "",
      app: listOf(params.get("app")),
      aud: ((params.get("aud") as ReportState["aud"]) || "both") as ReportState["aud"],
      type: listOf(params.get("type")),
      program: listOf(params.get("program")),
      grade: listOf(params.get("grade")),
      classGroup: listOf(params.get("classGroup")),
      preset: presetKey,
    };
  }, [params, defaults.preset, defaults.gran]);

  const update = useCallback(
    (patch: Partial<ReportState>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            const val = Array.isArray(v) ? v.join(",") : (v as string | undefined);
            if (val === undefined || val === "" || (k === "aud" && val === "both")) next.delete(k);
            else next.set(k, val);
          }
          if (patch.from || patch.to) next.set("preset", "custom");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  /** Query string for the API (only the parameters the server reads). */
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", state.from);
    p.set("to", state.to);
    p.set("gran", state.gran);
    if (state.compare) p.set("compare", state.compare);
    if (state.app.length) p.set("app", state.app.join(","));
    if (state.aud !== "both") p.set("aud", state.aud);
    if (state.type.length) p.set("type", state.type.join(","));
    if (state.program.length) p.set("program", state.program.join(","));
    if (state.grade.length) p.set("grade", state.grade.join(","));
    if (state.classGroup.length) p.set("classGroup", state.classGroup.join(","));
    return p.toString();
  }, [state]);

  return { state, update, qs };
}
