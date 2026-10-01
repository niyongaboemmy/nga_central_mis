import { isAppKey } from "../apps";
import { q } from "../db";
import { EXCLUDED, pct, ReportQuery, segmentSql } from "./common";

/**
 * Explore (plan §14 page 12): funnels and paths, GA4-style.
 *
 * MySQL 5.7 has no window functions, so sequencing is done here over a bounded event set
 * (≤ 90 days, ≤ 400k rows). Steps are either a feature (a page view of it) or an event name.
 */
export interface FunnelStep {
  type: "feature" | "event";
  value: string;
  label?: string;
}

export interface FunnelOptions {
  steps: FunnelStep[];
  /** closed: people must enter at step 1; open: they may enter at any step (GA4). */
  mode: "open" | "closed";
  /** Count within one visit, or per person within N days of their first step. */
  within: "session" | "days";
  days?: number;
}

const MAX_ROWS = 400_000;

const loadSteps = async (rq: ReportQuery, steps: FunnelStep[], unit: "session" | "person") => {
  const features = steps.filter((s) => s.type === "feature").map((s) => s.value);
  const events = steps.filter((s) => s.type === "event").map((s) => s.value);
  const conds: string[] = [];
  const params: any[] = [];
  if (features.length) {
    conds.push("(e.name = 'page_view' AND e.feature IN (?))");
    params.push(features);
  }
  if (events.length) {
    conds.push("e.name IN (?)");
    params.push(events);
  }
  if (!conds.length) return [];
  const seg = segmentSql("e.user_id", rq.seg);
  const aud = rq.aud === "user" ? " AND e.user_id IS NOT NULL" : rq.aud === "visitor" ? " AND e.user_id IS NULL" : "";
  return q<any>(
    `SELECT ${unit === "session" ? "e.session_id" : "COALESCE(CONCAT('u', e.user_id), e.device_id)"} AS unit,
            e.occurred_at, e.name, e.feature, e.app
       FROM AnalyticsEvent e
      WHERE e.occurred_at >= ? AND e.occurred_at < ? AND (e.flags & 13) = 0 AND (${conds.join(" OR ")})
        AND (e.user_id IS NULL OR e.user_id NOT IN ${EXCLUDED})${rq.apps.length ? " AND e.app IN (?)" : ""}${aud}${seg.sql}
        ${unit === "session" ? "AND e.session_id IS NOT NULL" : ""}
      ORDER BY unit, e.occurred_at LIMIT ${MAX_ROWS}`,
    [rq.fromAt, rq.toAt, ...params, ...(rq.apps.length ? [rq.apps] : []), ...seg.params],
  );
};

const matches = (row: any, step: FunnelStep) => (step.type === "feature" ? row.name === "page_view" && row.feature === step.value : row.name === step.value);

export const funnel = async (rq: ReportQuery, o: FunnelOptions) => {
  const steps = o.steps.slice(0, 10);
  if (steps.length < 2) throw new Error("A funnel needs at least two steps");
  const unit = o.within === "session" ? "session" : "person";
  const rows = await loadSteps(rq, steps, unit);
  const windowMs = Math.max(1, Math.min(90, o.days ?? 7)) * 86_400_000;
  const byUnit = new Map<string, any[]>();
  for (const r of rows) {
    const k = String(r.unit);
    if (!byUnit.has(k)) byUnit.set(k, []);
    byUnit.get(k)!.push(r);
  }
  const reached = steps.map(() => 0);
  const entered = steps.map(() => 0);
  const elapsed: number[][] = steps.map(() => []);
  /** Walk the steps in order from the first occurrence of `start`; how far does it get? */
  const attempt = (seq: any[], start: number) => {
    const i = seq.findIndex((r) => matches(r, steps[start]));
    if (i < 0) return null;
    const t0 = new Date(seq[i].occurred_at).getTime();
    const times = [t0];
    let end = start;
    for (let j = i + 1; j < seq.length && end + 1 < steps.length; j++) {
      const t = new Date(seq[j].occurred_at).getTime();
      if (unit === "person" && t - t0 > windowMs) break;
      if (matches(seq[j], steps[end + 1])) {
        end++;
        times.push(t);
      }
    }
    return { start, end, times };
  };
  for (const seq of byUnit.values()) {
    // Closed funnels must enter at step 1; open funnels at whichever entry gets furthest
    // (ties: the earliest entry step).
    const candidates = (o.mode === "closed" ? [0] : steps.map((_, k) => k)).map((k) => attempt(seq, k)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!candidates.length) continue;
    const best = candidates.reduce((x, y) => (y.end > x.end || (y.end === x.end && y.start < x.start) ? y : x));
    entered[best.start]++;
    for (let k = best.start; k <= best.end; k++) reached[k]++;
    for (let k = 1; k < best.times.length; k++) elapsed[best.start + k].push(best.times[k] - best.times[0]);
  }
  const median = (a: number[]) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return Math.round(s[Math.floor(s.length / 2)] / 1000);
  };
  return {
    unit,
    mode: o.mode,
    truncated: rows.length >= MAX_ROWS,
    steps: steps.map((s, i) => ({
      ...s,
      reached: reached[i],
      entered_here: entered[i],
      rate_from_start: pct(reached[i], reached[0] || Math.max(...reached)),
      rate_from_previous: i === 0 ? null : pct(reached[i], reached[i - 1]),
      dropped: i === 0 ? 0 : Math.max(0, reached[i - 1] - reached[i] + (o.mode === "open" ? entered[i] : 0)),
      median_seconds_from_start: i === 0 ? null : median(elapsed[i]),
    })),
  };
};

/**
 * Paths from (forward) or to (backward) a feature: the next / previous pages in the same
 * visit, aggregated per depth. Returns nodes per level and the links between them.
 */
export const paths = async (rq: ReportQuery, opts: { feature: string; direction: "forward" | "backward"; depth?: number }) => {
  const depth = Math.max(1, Math.min(5, opts.depth ?? 4));
  const anchorSessions = await q<any>(
    `SELECT DISTINCT e.session_id FROM AnalyticsEvent e
      WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.name = 'page_view' AND e.feature = ? AND (e.flags & 13) = 0
        AND e.session_id IS NOT NULL${rq.apps.length ? " AND e.app IN (?)" : ""}
      LIMIT 20000`,
    [rq.fromAt, rq.toAt, opts.feature, ...(rq.apps.length ? [rq.apps] : [])],
  );
  if (!anchorSessions.length) return { anchor: opts.feature, direction: opts.direction, sessions: 0, levels: [], links: [] };
  const ids = anchorSessions.map((r) => r.session_id);
  const views = await q<any>(
    `SELECT e.session_id, e.occurred_at, e.feature, e.app FROM AnalyticsEvent e
      WHERE e.session_id IN (?) AND e.name = 'page_view' AND e.feature IS NOT NULL
      ORDER BY e.session_id, e.occurred_at LIMIT ${MAX_ROWS}`,
    [ids],
  );
  const bySession = new Map<string, { feature: string; app: number }[]>();
  for (const v of views) {
    const k = String(v.session_id);
    if (!bySession.has(k)) bySession.set(k, []);
    const list = bySession.get(k)!;
    // Collapse reloads of the same page.
    if (list[list.length - 1]?.feature !== v.feature) list.push({ feature: v.feature, app: v.app });
  }
  const levels: Map<string, number>[] = Array.from({ length: depth + 1 }, () => new Map());
  const links = new Map<string, number>();
  let counted = 0;
  for (const seq of bySession.values()) {
    const idx = seq.findIndex((s) => s.feature === opts.feature);
    if (idx < 0) continue;
    counted++;
    const step = opts.direction === "forward" ? 1 : -1;
    let prevKey = `0|${opts.feature}`;
    levels[0].set(opts.feature, (levels[0].get(opts.feature) ?? 0) + 1);
    for (let d = 1; d <= depth; d++) {
      const s = seq[idx + step * d];
      const f = s ? s.feature : "(end of visit)";
      levels[d].set(f, (levels[d].get(f) ?? 0) + 1);
      const key = `${d}|${f}`;
      links.set(`${prevKey}>${key}`, (links.get(`${prevKey}>${key}`) ?? 0) + 1);
      if (!s) break;
      prevKey = key;
    }
  }
  // Keep the top 8 per level, fold the rest into "(other)".
  const levelsOut = levels.map((m, d) => {
    const sorted = [...m].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 8).map(([feature, n]) => ({ feature, n, app: isAppKey(feature.split(".")[0]) ? feature.split(".")[0] : null }));
    const rest = sorted.slice(8).reduce((s, [, n]) => s + n, 0);
    return { depth: d, nodes: rest ? [...top, { feature: "(other)", n: rest, app: null }] : top };
  }).filter((l) => l.nodes.length);
  return {
    anchor: opts.feature,
    direction: opts.direction,
    sessions: counted,
    levels: levelsOut,
    links: [...links].map(([k, n]) => {
      const [a, b] = k.split(">");
      return { from: a, to: b, n };
    }).sort((x, y) => y.n - x.n).slice(0, 200),
  };
};
