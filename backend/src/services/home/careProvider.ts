import { sql } from "drizzle-orm";
import { db } from "../../db";
import { AccessSnapshot, Depth, ScopeEntry, decide, scopeFor } from "../../vendor/nga-access";
import { getSnapshot } from "../access/snapshotCache";
import * as safeguarding from "../safeguarding";
import * as earlyWarning from "../earlyWarning";
import * as staffCover from "../staffCover";
import { childrenOf } from "../families";
import { addDaysYmd, kigaliParts, parseClock } from "../reminders/time";
import { lensesOfType, ResolvedLens } from "./access";
import type { AttentionItem, GlanceTile } from "./contract";
import { EMPTY, ProviderContext, ProviderResult } from "./providers";

// ============================================================================
// Care and cover on Home: the modules added for NGA Desktop that only spoke
// through notifications until now.
//   safeguarding team   new concerns to acknowledge, concerns assigned to me
//   student             this week's wellbeing check-in
//   early warning       at-risk students with no plan, intervention reviews due
//   cover managers      absences to decide, lessons still without cover
//   any teacher         lessons I'm covering
//   parent              a child who needs a word this week
//
// Safeguarding, early warning and cover pages are guarded by requireCapability,
// which always asks the v2 engine -- so Home asks the same snapshot, whatever
// the MIS access mode, and never shows a button to a page that answers 403.
// Each section is optional: a missing table or a failed query only drops it.
// ============================================================================

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const SCHOOL = { type: "SCHOOL" } as any;

type Section = { items: AttentionItem[]; tiles: GlanceTile[] };
const none = (): Section => ({ items: [], tiles: [] });

/** The lens a capability's grants put on the page; school-wide work falls back to School, then Me. */
function lensFor(ctx: ProviderContext, snapshot: AccessSnapshot, cap: string): ResolvedLens {
  const via = new Set((snapshot.caps?.[cap] ?? []).flatMap((e) => e.via));
  const own = ctx.access.lenses.find((l) => l.type !== "SELF" && l.via.some((g) => via.has(g)));
  return own ?? lensesOfType(ctx.access, "SCHOOL")[0] ?? lensesOfType(ctx.access, "SELF")[0];
}

function mk(lens: ResolvedLens, kind: string, fields: Omit<AttentionItem, "id" | "source" | "kind" | "lens" | "via"> & { scope?: string }): AttentionItem {
  const { scope, ...rest } = fields;
  return { id: `mis:${kind}:${lens.key}${scope ? `:${scope}` : ""}`, source: "mis", kind, lens: lens.key, via: lens.via, ...rest };
}

const isoUtc = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(typeof v === "string" && !/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? `${v.replace(" ", "T")}Z` : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const hoursAgo = (iso: string | null, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / 3_600_000 : 0);
/** Kigali noon of a YYYY-MM-DD day, as an instant for due_at. */
const dayInstant = (ymd: string | null) => (ymd ? `${ymd}T10:00:00.000Z` : null);
const shortDay = (ymd: string, today: string) =>
  ymd === today
    ? "today"
    : ymd === addDaysYmd(today, 1)
      ? "tomorrow"
      : new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// ─── safeguarding team ──────────────────────────────────────────────────────

async function safeguardingTeam(ctx: ProviderContext, snapshot: AccessSnapshot): Promise<Section> {
  if (!decide(snapshot, safeguarding.CAP, SCHOOL).allowed) return none();
  const lens = lensFor(ctx, snapshot, safeguarding.CAP);
  const me = ctx.access.userId;
  const [c] = rows(await db.execute(sql`
    SELECT SUM(status = 'new') AS fresh, SUM(status = 'new' AND severity = 'high') AS freshHigh,
           DATE_FORMAT(MIN(CASE WHEN status = 'new' THEN created_at END), '%Y-%m-%dT%H:%i:%sZ') AS oldestNew,
           SUM(status <> 'closed') AS open, SUM(status <> 'closed' AND severity = 'high') AS openHigh,
           SUM(status <> 'closed' AND assigned_to = ${me}) AS mine
    FROM SafeguardingConcern`));
  const fresh = Number(c?.fresh ?? 0);
  const freshHigh = Number(c?.freshHigh ?? 0);
  const open = Number(c?.open ?? 0);
  const openHigh = Number(c?.openHigh ?? 0);
  const mine = Number(c?.mine ?? 0);
  const out = none();
  // Concerns are sensitive: Home shows counts only, never who or what.
  if (fresh) {
    const oldest = isoUtc(c.oldestNew);
    out.items.push(
      mk(lens, "SG-01", {
        tier: freshHigh || hoursAgo(oldest, ctx.now) >= 24 ? "blocking" : "slipping",
        depth: "summary",
        count: fresh,
        title: `${fresh} new safeguarding ${plural(fresh, "concern", "concerns")} to acknowledge${freshHigh ? ` (${freshHigh} urgent)` : ""}`,
        entities: [],
        why: "Nobody on the safeguarding team has opened them yet.",
        cta: { label: "Open concerns", href: "/safeguarding" },
        waiting_since: oldest,
      }),
    );
  }
  if (mine) {
    out.items.push(
      mk(lens, "SG-02", {
        tier: "slipping",
        depth: "summary",
        count: mine,
        title: `${mine} safeguarding ${plural(mine, "concern is", "concerns are")} assigned to you`,
        entities: [],
        why: "Still open. Add a note on what was done, or close them when resolved.",
        cta: { label: "My concerns", href: "/safeguarding" },
      }),
    );
  }
  out.tiles.push({
    id: "mis:safeguarding:open",
    source: "mis",
    lens: lens.key,
    label: "Open safeguarding concerns",
    value: String(open),
    status: openHigh ? "critical" : open ? "warning" : "good",
    hint: openHigh ? `${openHigh} urgent` : undefined,
    href: "/safeguarding",
  });
  return out;
}

// ─── student: weekly check-in ───────────────────────────────────────────────

async function weeklyCheckIn(ctx: ProviderContext): Promise<Section> {
  if (ctx.access.persona !== "STUDENT") return none();
  const self = lensesOfType(ctx.access, "SELF")[0];
  const mine = await safeguarding.myCheckIn(ctx.access.userId, ctx.now);
  if (mine.done) return none();
  // From Thursday the week is running out.
  const dow = kigaliParts(ctx.now).dow;
  return {
    items: [
      mk(self, "SG-S1", {
        tier: dow >= 4 || dow === 0 ? "slipping" : "tidy",
        depth: "detail",
        count: 1,
        title: "Your weekly check-in is waiting",
        entities: [],
        why: "Two quick questions on how your week is going. Only the wellbeing team sees the answers.",
        cta: { label: "Do the check-in", href: "/wellbeing" },
        due_at: dayInstant(addDaysYmd(mine.week, 6)),
      }),
    ],
    tiles: [],
  };
}

// ─── early warning ──────────────────────────────────────────────────────────

async function earlyWarnings(ctx: ProviderContext, snapshot: AccessSnapshot): Promise<Section> {
  const scope: ScopeEntry | null = scopeFor(snapshot, earlyWarning.CAP);
  if (!scope) return none();
  const lens = lensFor(ctx, snapshot, earlyWarning.CAP);
  const depth: Depth | null = decide(snapshot, earlyWarning.CAP, null).depth ?? null;
  const named = depth === "detail" || depth === "sensitive";
  const today = kigaliParts(ctx.now).ymd;
  const [students, [due]] = await Promise.all([
    earlyWarning.listForScope(scope as any, { level: "any" }),
    db
      .execute(sql`
        SELECT COUNT(*) AS n, DATE_FORMAT(MIN(review_date), '%Y-%m-%d') AS first FROM EarlyWarningIntervention
        WHERE owner_id = ${ctx.access.userId} AND status = 'open' AND review_date IS NOT NULL AND review_date <= ${today}`)
      .then(rows),
  ]);
  const atRisk = students.filter((s) => s.level === "at_risk");
  const noPlan = atRisk.filter((s) => s.openInterventions === 0);
  const out = none();
  if (noPlan.length) {
    out.items.push(
      mk(lens, "EW-01", {
        tier: "slipping",
        depth: named ? "detail" : "summary",
        count: noPlan.length,
        title: `${noPlan.length} at-risk ${plural(noPlan.length, "student has", "students have")} no support plan`,
        entities: named ? noPlan.slice(0, 5).map((s) => (s.className ? `${s.name} · ${s.className}` : s.name)) : [],
        why: noPlan[0].reasons[0]?.text ? `For example: ${noPlan[0].reasons[0].text.toLowerCase()}.` : "Missed lessons, missed work or falling marks across the apps.",
        cta: { label: "Plan support", href: "/early-warning" },
      }),
    );
  }
  const reviews = Number(due?.n ?? 0);
  if (reviews) {
    out.items.push(
      mk(lens, "EW-02", {
        tier: due.first < today ? "blocking" : "slipping",
        depth: "detail",
        count: reviews,
        title: `${reviews} support ${plural(reviews, "plan is", "plans are")} due for review`,
        entities: [],
        why: "Say how it went, or set a new review date.",
        cta: { label: "Review plans", href: "/early-warning" },
        due_at: dayInstant(due.first),
      }),
    );
  }
  const watch = students.filter((s) => s.level === "watch").length;
  if (students.length) {
    out.tiles.push({
      id: "mis:early-warning:at-risk",
      source: "mis",
      lens: lens.key,
      label: "Students at risk",
      value: String(atRisk.length),
      status: atRisk.length ? "critical" : watch ? "warning" : "good",
      hint: watch ? `${watch} to watch` : undefined,
      href: "/early-warning",
    });
  }
  return out;
}

// ─── staff absence and cover ────────────────────────────────────────────────

async function coverManager(ctx: ProviderContext, snapshot: AccessSnapshot): Promise<Section> {
  if (!decide(snapshot, staffCover.CAP, SCHOOL).allowed) return none();
  const lens = lensFor(ctx, snapshot, staffCover.CAP);
  const { ymd: today, minutes } = kigaliParts(ctx.now);
  const tomorrow = addDaysYmd(today, 1);
  const [[pending], open] = await Promise.all([
    db
      .execute(sql`
        SELECT COUNT(*) AS n, DATE_FORMAT(MIN(from_date), '%Y-%m-%d') AS first,
               DATE_FORMAT(MIN(created_at), '%Y-%m-%dT%H:%i:%sZ') AS since
        FROM StaffAbsence WHERE status = 'pending' AND to_date >= ${today}`)
      .then(rows),
    db
      .execute(sql`
        SELECT DATE_FORMAT(lesson_date, '%Y-%m-%d') AS date, start_time AS start, end_time AS end, subject_name AS subject, class_name AS className
        FROM CoverLesson WHERE status = 'open' AND lesson_date BETWEEN ${today} AND ${addDaysYmd(today, 6)}
        ORDER BY lesson_date, start_time`)
      .then(rows),
  ]);
  const out = none();
  const n = Number(pending?.n ?? 0);
  if (n) {
    out.items.push(
      mk(lens, "CV-01", {
        tier: pending.first <= tomorrow ? "blocking" : "slipping",
        depth: "summary",
        count: n,
        title: `${n} staff ${plural(n, "absence", "absences")} waiting for your decision`,
        entities: [],
        why: "Lessons get cover only once an absence is approved.",
        cta: { label: "Decide", href: "/cover" },
        due_at: dayInstant(pending.first),
        waiting_since: isoUtc(pending.since),
      }),
    );
  }
  // A lesson that already ended today is past helping.
  const uncovered = open.filter((l: any) => l.date > today || (parseClock(l.end ?? l.start) ?? 0) + (l.end ? 0 : 40) > minutes);
  if (uncovered.length) {
    const soon = uncovered.filter((l: any) => l.date <= tomorrow).length;
    out.items.push(
      mk(lens, "CV-02", {
        tier: soon ? "blocking" : "slipping",
        depth: "detail",
        count: uncovered.length,
        title: `${uncovered.length} ${plural(uncovered.length, "lesson needs", "lessons need")} a cover teacher${soon ? ` (${soon} by tomorrow)` : ""}`,
        entities: uncovered.slice(0, 4).map((l: any) => `${l.subject || "Lesson"} · ${l.className || "?"} · ${shortDay(l.date, today)} ${String(l.start).slice(0, 5)}`),
        why: "A class will be left without a teacher.",
        cta: { label: "Assign cover", href: "/cover" },
        due_at: dayInstant(uncovered[0].date),
      }),
    );
  }
  return out;
}

async function myCovers(ctx: ProviderContext): Promise<Section> {
  const self = lensesOfType(ctx.access, "SELF")[0];
  const { ymd: today, minutes } = kigaliParts(ctx.now);
  const list = rows(await db.execute(sql`
    SELECT DATE_FORMAT(lesson_date, '%Y-%m-%d') AS date, start_time AS start, end_time AS end, subject_name AS subject,
           class_name AS className, location
    FROM CoverLesson WHERE cover_teacher_id = ${ctx.access.userId} AND status = 'assigned'
      AND lesson_date BETWEEN ${today} AND ${addDaysYmd(today, 6)}
    ORDER BY lesson_date, start_time LIMIT 20`)).filter(
    (l: any) => l.date > today || (parseClock(l.end ?? l.start) ?? 0) + (l.end ? 0 : 40) > minutes,
  );
  if (!list.length) return none();
  const todays = list.filter((l: any) => l.date === today);
  const shown = todays.length ? todays : list;
  return {
    items: [
      mk(self, "CV-03", {
        tier: todays.length ? "slipping" : "tidy",
        depth: "detail",
        count: shown.length,
        title: todays.length
          ? `You're covering ${todays.length} ${plural(todays.length, "lesson", "lessons")} today`
          : `You're covering ${list.length} ${plural(list.length, "lesson", "lessons")} this week`,
        entities: shown
          .slice(0, 5)
          .map((l: any) => `${l.subject || "Lesson"} · ${l.className || "?"} · ${todays.length ? "" : `${shortDay(l.date, today)} `}${String(l.start).slice(0, 5)}${l.location ? ` · ${l.location}` : ""}`),
        why: "A colleague is away; their class is yours for these lessons.",
        cta: { label: "See my covers", href: "/cover" },
        due_at: dayInstant(shown[0].date),
      }),
    ],
    tiles: [],
  };
}

// ─── parents ────────────────────────────────────────────────────────────────

async function family(ctx: ProviderContext): Promise<Section> {
  const lens = lensesOfType(ctx.access, "CHILDREN")[0];
  if (!lens) return none();
  const kids = await childrenOf(ctx.access.userId);
  const out = none();
  for (const k of kids) {
    if (k.attention) {
      const said = [k.attendance, k.conduct, k.schoolwork].filter(Boolean) as string[];
      out.items.push(
        mk(lens, "FAM-01", {
          scope: String(k.studentId),
          tier: "slipping",
          depth: "detail",
          count: 1,
          title: `${k.firstName} may need a word this week`,
          entities: [k.name, ...(k.className ? [k.className] : [])],
          why: said.join(" "),
          cta: { label: `See ${k.firstName}'s week`, href: "/family" },
        }),
      );
    }
  }
  for (const k of kids.slice(0, 3)) {
    out.tiles.push({
      id: `mis:family:${k.studentId}`,
      source: "mis",
      lens: lens.key,
      label: `${k.firstName}'s week`,
      value: k.asOf ? (k.attention ? "Needs a word" : "On track") : "No news yet",
      status: k.asOf ? (k.attention ? "warning" : "good") : undefined,
      hint: k.className ?? undefined,
      href: "/family",
    });
  }
  return out;
}

// ─── the provider ───────────────────────────────────────────────────────────

export async function careProvider(ctx: ProviderContext): Promise<ProviderResult> {
  // v2 snapshot, as the pages' guards see it. Without the engine those pages
  // refuse everyone, so their sections stay off Home too.
  let snapshot: AccessSnapshot | null = null;
  if (ctx.access.v2Ready) {
    snapshot = ctx.access.source === "v2" ? ctx.access.snapshot : await getSnapshot(ctx.access.userId, "mis").catch(() => null);
  }
  const optional = (p: Promise<Section>) => p.catch(() => none());
  const sections = await Promise.all([
    snapshot ? optional(safeguardingTeam(ctx, snapshot)) : none(),
    snapshot ? optional(earlyWarnings(ctx, snapshot)) : none(),
    snapshot ? optional(coverManager(ctx, snapshot)) : none(),
    optional(weeklyCheckIn(ctx)),
    optional(myCovers(ctx)),
    optional(family(ctx)),
  ]);
  const items = sections.flatMap((s) => s.items);
  const tiles = sections.flatMap((s) => s.tiles);
  if (!items.length && !tiles.length) return EMPTY;
  return { items, tiles, actions: [] };
}
