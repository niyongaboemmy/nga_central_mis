import logger from "../../utils/logger";
import { localIsoDate, resolvePeriod, toIsoDate, weekOfTerm, weeksInTerm } from "../academicPeriod";
import { resolveHomeAccess } from "./access";
import { configuredApps } from "./apps";
import { HomeOverview, QuickAction, TodayLesson } from "./contract";
import {
  classProvider,
  EMPTY,
  learnerProvider,
  mentorProvider,
  operationsProvider,
  oversightProvider,
  ProviderContext,
  ProviderResult,
  rankItems,
  teachingProvider,
} from "./providers";
import { officeHoursProvider } from "./officeHoursProvider";
import { careProvider } from "./careProvider";

// ============================================================================
// GET /home/overview -- one request, every MIS module, the viewer's lenses.
//
// Built for the production pool's single connection (see the 2026-09-22
// teacher-dashboard incident): providers run in one Promise.all wave so the
// driver pipelines their queries; each provider is optional, so one failing
// module degrades to an empty panel (named in `degraded`) instead of a 500;
// and the whole answer is cached per user for a minute.
// ============================================================================

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: HomeOverview }>();

export function clearHomeCache() {
  cache.clear();
}

const PROVIDERS: Array<[string, (ctx: ProviderContext) => Promise<ProviderResult>]> = [
  ["teaching", teachingProvider],
  ["learning", learnerProvider],
  ["mentoring", mentorProvider],
  ["class", classProvider],
  ["oversight", oversightProvider],
  ["operations", operationsProvider],
  // Mandatory office hours (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §17.3).
  ["office_hours", officeHoursProvider],
  // Safeguarding, early warning, staff cover and families (careProvider.ts).
  ["care", careProvider],
];

export async function buildHomeOverview(
  userId: number,
  q: { yearId?: number; termId?: number; refresh?: boolean; previewOf?: number } = {},
): Promise<HomeOverview> {
  const { term, year } = await resolvePeriod(q.yearId, q.termId);
  const termId = term?.academic_term_id ?? null;
  const yearId = year?.academic_year_id ?? null;

  const access = await resolveHomeAccess(userId, yearId);
  const now = new Date();
  const todayIso = localIsoDate(now);
  const key = `${userId}|${access.source}|${access.snapshot.v}|${todayIso}|${termId}|${yearId}`;
  const hit = cache.get(key);
  if (!q.refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const period = {
    yearId,
    termId,
    termStart: toIsoDate(term?.start_date),
    termEnd: toIsoDate(term?.end_date),
    week: weekOfTerm(term?.start_date, now),
  };
  const ctx: ProviderContext = {
    access,
    period,
    now,
    todayIso,
    dow: now.getDay(),
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
  };

  const degraded: string[] = [];
  const results = await Promise.all(
    PROVIDERS.map(([name, run]) =>
      run(ctx).catch((error) => {
        degraded.push(name);
        logger.warn("Home provider failed; serving it empty", {
          provider: name,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return EMPTY;
      }),
    ),
  );

  const lessons: TodayLesson[] = results.flatMap((r) => r.lessons ?? []);
  lessons.sort((a, b) => a.start_time.localeCompare(b.start_time));
  const seenActions = new Set<string>();
  const actions: QuickAction[] = [];
  for (const a of results.flatMap((r) => r.actions)) {
    if (seenActions.has(a.href)) continue;
    seenActions.add(a.href);
    actions.push(a);
  }

  // Lenses that produce nothing (no items, tiles or lessons) stay off the
  // switcher -- except "Me", which always exists.
  const used = new Set<string>([
    ...results.flatMap((r) => r.items.map((i) => i.lens)),
    ...results.flatMap((r) => r.tiles.map((t) => t.lens)),
    ...results.flatMap((r) => r.actions.map((a) => a.lens)),
  ]);
  const lenses = access.lenses
    .filter((l) => l.type === "SELF" || used.has(l.key) || (l.type === "TEACHING" && lessons.length > 0))
    .map(({ key, type, label, reason, via }) => ({ key, type, label, reason, via }));

  const overview: HomeOverview = {
    version: 1,
    viewer: {
      user_id: userId,
      first_name: access.firstName,
      last_name: access.lastName,
      persona: access.persona,
      ...(q.previewOf ? { preview_of: q.previewOf } : {}),
    },
    access: { source: access.source, mode: access.mode, version: access.snapshot.v },
    period: {
      academic_year_id: yearId,
      academic_year_name: year?.name ?? null,
      academic_term_id: termId,
      academic_term_name: term?.name ?? null,
      term_start_date: period.termStart,
      term_end_date: period.termEnd,
      week_of_term: period.week,
      weeks_in_term: weeksInTerm(term?.start_date, term?.end_date),
    },
    lenses,
    default_lens: "EVERYTHING",
    today: {
      date: todayIso,
      server_now: now.toISOString(),
      day_of_week: ctx.dow,
      lessons,
      activities: results.flatMap((r) => r.activities ?? []),
      next_teaching_day: results.find((r) => r.nextTeachingDay)?.nextTeachingDay ?? null,
    },
    items: rankItems(results.flatMap((r) => r.items), now),
    tiles: results.flatMap((r) => r.tiles),
    quick_actions: actions.slice(0, 8),
    apps: configuredApps().map((a) => ({ source: a.source, name: a.name })),
    degraded,
    generated_at: now.toISOString(),
  };

  // Last line of defence (plan §3.2): a summary-depth item never names anyone.
  for (const item of overview.items) if (item.depth === "summary") item.entities = [];

  cache.set(key, { at: Date.now(), value: overview });
  if (cache.size > 2000) cache.clear();
  return overview;
}
