import { useCallback, useEffect, useRef, useState } from "react";
import { getHomeAppSummary } from "../../api/home";
import type { HomeOverview } from "./contract";
import type { AppState } from "./appContract";

/** Other apps change faster than the MIS paperwork: messages, registers. */
export const APP_REFRESH_MS = 2 * 60 * 1000;

/**
 * Ask every app connected to Home for its summary, in parallel, once the MIS
 * overview is known (it names the apps and today's lessons). Each app is
 * independent: a slow or absent app only ever affects its own rows.
 */
export function useAppSummaries(data: HomeOverview | null, yearId: number | null | undefined): AppState[] {
  const [states, setStates] = useState<AppState[]>([]);
  const inFlight = useRef(false);
  const apps = data?.apps ?? [];
  const appKey = apps.map((a) => a.source).join(",");
  const lessons = (data?.today.lessons ?? [])
    .filter((l) => l.kind === "teaching")
    .map((l) => ({
      lesson_key: l.lesson_key,
      class_group_id: l.class_group_id,
      subject_id: l.subject_id,
      subject_name: l.subject_name,
      class_group_name: l.class_group_name,
      date: data!.today.date,
      start_time: l.start_time,
      end_time: l.end_time,
    }));
  const lessonKey = lessons.map((l) => l.lesson_key).join("|");
  const date = data?.today.date;

  const load = useCallback(async () => {
    if (!appKey || inFlight.current) return;
    inFlight.current = true;
    setStates((prev) =>
      apps.map((a) => prev.find((p) => p.source === a.source) ?? { source: a.source, name: a.name, status: "loading" as const }),
    );
    await Promise.all(
      apps.map(async (a) => {
        const result = await getHomeAppSummary(a.source, { date, academic_year_id: yearId ?? undefined, lessons });
        setStates((prev) => prev.map((p) => (p.source === a.source ? { ...result, name: a.name } : p)));
      }),
    );
    inFlight.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, lessonKey, date, yearId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, APP_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return states;
}
