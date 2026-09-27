import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Eye, RefreshCw } from "lucide-react";
import { useUser } from "../../contexts/UserContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { useCurrentTime } from "../calendar/useCurrentTime";
import { useHomeData } from "./useHomeData";
import { useAppSummaries } from "./useAppSummaries";
import { HOME_DEMO, demoAppStates, withDemoOverview } from "./demoData";
import {
  audienceOf,
  EVERYTHING,
  greeting,
  itemsForLens,
  mergeApps,
  pickHero,
  pressureByLens,
  rankItems,
  switcherLenses,
} from "./merge";
import type { HomeLens } from "./contract";
import { NeedsYouList } from "./NeedsYouList";
import { NextUpHero, TodayCard } from "./TodaySections";
import { CommsCard, GlanceTiles, QuickActions, SourceHealth, type UpdateEntry, UpdatesCard } from "./SideCards";
import { Skeleton } from "./ui";

// ─── Home ───────────────────────────────────────────────────────────────────
//
// The page every user lands on after signing in
// (HOME_OVERVIEW_IMPLEMENTATION_PLAN.md). It answers, in order:
//   1. what needs me now      -> "Next up" + "Needs you", ranked across modules
//   2. what my day looks like -> "Today"
//   3. how my areas are doing -> "At a glance", "Updates", quick actions
// Who sees what is decided on the server by the access engine; this page only
// arranges it. Lenses ("Teaching", "Class S4A", "Sciences") let someone with
// several positions focus on one; "Everything" merges them.
// ─────────────────────────────────────────────────────────────────────────────

const LENS_STORAGE_KEY = "home.lens";
/** Below this many items there is nothing worth filtering, so no focus tabs. */
const LENS_MIN_ITEMS = 4;

const readLens = (): string => {
  try {
    return localStorage.getItem(LENS_STORAGE_KEY) || EVERYTHING;
  } catch {
    return EVERYTHING;
  }
};
const saveLens = (lens: string) => {
  try {
    localStorage.setItem(LENS_STORAGE_KEY, lens);
  } catch {
    /* per-viewer convenience only */
  }
};

/**
 * Focus switcher. These are toggle buttons filtering one list, not ARIA tabs
 * (there are no tab panels), so each is a plain button with aria-pressed and
 * normal Tab order. `contain: inline-size` stops the chip row's natural width
 * from widening the page on a phone -- it scrolls sideways inside itself.
 */
const LensSwitcher: React.FC<{
  lenses: HomeLens[];
  value: string;
  pressure: Record<string, number>;
  onChange: (lens: string) => void;
}> = ({ lenses, value, pressure, onChange }) => {
  const options = [{ key: EVERYTHING, label: "Everything" }, ...lenses.map((l) => ({ key: l.key, label: l.label }))];
  return (
    <div
      role="group"
      aria-label="Focus"
      className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 [contain:inline-size] [scrollbar-width:none]"
    >
      {options.map((o) => {
        const active = o.key === value;
        const n = pressure[o.key] ?? 0;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={`inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? "border-transparent bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border-border-light dark:border-border-dark/60 bg-card-light dark:bg-card-dark/30 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {o.label}
            {n > 0 && (
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  active ? "bg-white/20" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                }`}
              >
                {n}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

const HomeSkeleton: React.FC = () => (
  <div className="space-y-5" aria-busy="true" aria-label="Loading your Home">
    <Skeleton className="h-16 w-2/3" />
    <Skeleton className="h-28" />
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="space-y-5 lg:col-span-8">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
      <div className="space-y-5 lg:col-span-4">
        <Skeleton className="h-44" />
        <Skeleton className="h-40" />
      </div>
    </div>
  </div>
);

const HomePage: React.FC = () => {
  const { user } = useUser();
  const { selectedYearId, selectedTermId } = useAcademicPeriod();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { minutes: nowMinutes, date: now } = useCurrentTime();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewAs = Number(searchParams.get("as")) || undefined;

  const { data: liveData, loading, refreshing, fromSnapshot, error, fetchedAt, refresh } = useHomeData({
    userId: user?.user?.user_id,
    yearId: selectedYearId,
    termId: selectedTermId,
    as: previewAs,
  });

  // Local demo mode only (see demoData.ts): a production build never takes this branch.
  const data = useMemo(() => (HOME_DEMO && liveData ? withDemoOverview(liveData) : liveData), [liveData]);

  const [lens, setLens] = useState<string>(readLens);
  // A remembered lens the user no longer has falls back to Everything.
  useEffect(() => {
    if (data && lens !== EVERYTHING && !data.lenses.some((l) => l.key === lens)) setLens(EVERYTHING);
  }, [data, lens]);
  const chooseLens = (next: string) => {
    setLens(next);
    saveLens(next);
  };

  // Other apps (Task Mentor, Attendance, Tupo) answer independently of the MIS.
  const liveAppStates = useAppSummaries(HOME_DEMO ? null : data, selectedYearId);
  const appStates = useMemo(
    () => (HOME_DEMO && data ? demoAppStates(data) : liveAppStates),
    [data, liveAppStates],
  );
  const apps = useMemo(() => mergeApps(appStates), [appStates]);

  const ranked = useMemo(
    () => (data ? rankItems([...data.items, ...apps.items], now) : []),
    [data, apps.items, now],
  );
  const visibleItems = useMemo(() => itemsForLens(ranked, lens), [ranked, lens]);
  const pressure = useMemo(() => pressureByLens(ranked), [ranked]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <HomeSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto w-10 h-10 text-amber-500" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-text-primary-light dark:text-text-primary-dark">
          We couldn't load your Home
        </h1>
        <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">{error?.message}</p>
        {error?.detail && <p className="mt-1 text-xs text-text-secondary-light/80 dark:text-text-secondary-dark/80">{error.detail}</p>}
        {error?.retryable !== false && (
          <button
            type="button"
            onClick={refresh}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" aria-hidden /> Try again
          </button>
        )}
      </div>
    );
  }

  const audience = audienceOf(data);
  const lenses = switcherLenses(data.lenses);
  const lensIsFocused = lens !== EVERYTHING;
  const allTiles = [...data.tiles, ...apps.tiles];
  const tiles = lensIsFocused ? allTiles.filter((t) => t.lens === lens) : allTiles;
  const updates: UpdateEntry[] = [
    ...notifications.map((n) => ({
      id: `mis:${n.notification.notification_id}`,
      title: n.notification.title,
      created_at: n.notification.created_at,
      unread: !n.notification.read_at,
      source: "mis",
      onOpen: () => {
        if (!n.notification.read_at) void markRead(n.notification.notification_id);
        if (n.notification.link) navigate(n.notification.link);
      },
    })),
    ...apps.updates.map((u) => ({
      id: u.id,
      title: u.title,
      created_at: u.created_at,
      unread: !u.read,
      source: u.source,
      onOpen: () => {
        if (u.href) window.open(u.href, "_blank", "noopener,noreferrer");
      },
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const unreadTotal = unreadCount + apps.updates.filter((u) => !u.read).length;
  const actions = lensIsFocused ? data.quick_actions.filter((a) => a.lens === lens) : data.quick_actions;
  const teaching = data.today.lessons.some((l) => l.kind === "teaching");
  const showToday =
    (data.today.lessons.length > 0 || data.today.activities.length > 0 || teaching || audience === "learner") &&
    (!lensIsFocused || lens === "TEACHING" || lens === "SELF");
  const hero = pickHero(visibleItems, showToday ? data.today.lessons : [], nowMinutes, data.today.next_teaching_day);
  const insightsTile = tiles.find((t) => t.metric);
  // "Next up" already shows its item in full; listing it again below was the
  // same card twice.
  const heroItemId = hero.kind === "item" ? hero.item.id : null;
  const listItems = heroItemId ? visibleItems.filter((i) => i.id !== heroItemId) : visibleItems;
  const showList = !(listItems.length === 0 && hero.kind === "clear");
  const p = data.period;
  const termPct =
    p.week_of_term && p.weeks_in_term ? Math.min(100, Math.round((p.week_of_term / p.weeks_in_term) * 100)) : null;
  const blockingCount = ranked.filter((i) => i.tier === "blocking").length;

  return (
    <div data-home-root className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 space-y-5">
      {data.viewer.preview_of && (
        <div className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-800 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-200">
          <Eye className="w-4 h-4 flex-shrink-0" aria-hidden />
          Previewing {data.viewer.first_name} {data.viewer.last_name}'s Home (read-only).
          <button type="button" onClick={() => navigate("/home")} className="ml-auto font-semibold underline">
            Back to mine
          </button>
        </div>
      )}

      {/* ① Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary-light dark:text-text-primary-dark">
            {greeting(now)}
            {data.viewer.first_name ? `, ${data.viewer.first_name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            {p.academic_term_name ? ` · ${p.academic_term_name}` : ""}
            {p.week_of_term && p.weeks_in_term && p.week_of_term <= p.weeks_in_term
              ? ` · Week ${p.week_of_term} of ${p.weeks_in_term}`
              : ""}
          </p>
          {termPct !== null && termPct < 100 && (
            <div className="mt-2 h-1.5 w-56 max-w-full rounded-full bg-surface-light dark:bg-surface-dark" aria-hidden>
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${termPct}%` }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <SourceHealth states={appStates} />
          {appStates.length > 0 && <span aria-hidden>·</span>}
          <span aria-live="polite">
            {refreshing ? "Updating…" : fromSnapshot ? "Showing your last visit" : fetchedAt ? `Updated ${fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh Home"
            className="grid place-items-center w-10 h-10 rounded-xl border border-border-light dark:border-border-dark/60 hover:bg-surface-light dark:hover:bg-surface-dark disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
          </button>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {blockingCount > 0 ? `${blockingCount} items need you now.` : "Nothing urgent."}
      </p>

      {/* ② Lenses */}
      {lenses.length > 0 && (ranked.length >= LENS_MIN_ITEMS || lensIsFocused) && <LensSwitcher lenses={lenses} value={lens} pressure={pressure} onChange={chooseLens} />}

      {error && (
        <p className="rounded-2xl bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Couldn't refresh just now — showing what was loaded before. {error.detail}
        </p>
      )}
      {data.degraded.length > 0 && (
        <p className="rounded-2xl bg-surface-light px-4 py-2 text-xs text-text-secondary-light dark:bg-surface-dark dark:text-text-secondary-dark">
          Some sections couldn't load ({data.degraded.join(", ")}). Everything else is up to date.
        </p>
      )}

      <GlanceTiles tiles={tiles} insightsHref={insightsTile ? "/insights" : undefined} wide />

      {/* ③ Next up */}
      <NextUpHero hero={hero} audience={audience} />

      {/* grid-cols-1 = minmax(0,1fr): without it the implicit column grows to its
          widest unbreakable line and a phone scrolls sideways. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="min-w-0 space-y-5 lg:col-span-8">
          {/* ⑤ A teacher opens Home to see their day: Today leads on every width.
              Everyone else gets it first on phones and after the list on desktop. */}
          {showToday && (
            <div className={teaching ? "" : "lg:hidden"}>
              <TodayCard today={data.today} nowMinutes={nowMinutes} teaching={teaching} registerMarks={apps.registerMarks} />
            </div>
          )}
          {showList && (
            <NeedsYouList
              items={listItems}
              lenses={data.lenses}
              audience={audience}
              showLens={!lensIsFocused && lenses.length > 0}
              quietWhenEmpty={hero.kind === "clear" || !!heroItemId}
              heroTaken={!!heroItemId}
            />
          )}
          {showToday && !teaching && (
            <div className="hidden lg:block">
              <TodayCard today={data.today} nowMinutes={nowMinutes} teaching={teaching} registerMarks={apps.registerMarks} />
            </div>
          )}
        </div>
        <aside className="min-w-0 space-y-5 lg:col-span-4" aria-label="Summary">
          {(!lensIsFocused || lens === "SELF") && <CommsCard comms={apps.comms} now={now} />}
          <QuickActions actions={actions.slice(0, 6)} />
          <UpdatesCard entries={updates} unreadCount={unreadTotal} onMarkAll={() => void markAllRead()} />
        </aside>
      </div>
    </div>
  );
};

export default HomePage;
