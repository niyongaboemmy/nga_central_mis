import type { SchemeProgressRow } from "../../api/schemeOfWork";
import { coverageRows, type CoverageRow } from "../teacher/analytics";
import type { StatusKey } from "../teacher/chartTheme";

// ─── Scheme of Work list: progress derivation ───────────────────────────────
//
// The list used to show only a validation badge, which answers "has someone
// reviewed this" and not "how much of the term have I actually planned". The
// second question is the one a teacher opens this page with.
//
// The tiering (on track / behind / not submitted) is *not* re-invented here:
// it comes from the same `coverageRows` the Teacher Dashboard's coverage chart
// uses, so a subject can never read "behind" on one screen and "on track" on
// the other.
// ─────────────────────────────────────────────────────────────────────────────

export interface SchemeCard extends SchemeProgressRow {
  /** Stable key for a (subject, class group) pair. */
  key: string;
  /** Weeks planned in the scheme. */
  planned: number;
  /** Weeks that should be planned by now — 0 when the term has no dates. */
  target: number;
  /** Planned against target, 0-100. 0 when there is no target to measure. */
  percent: number;
  tone: StatusKey;
  statusLabel: string;
}

export type SchemeFilter = "all" | "attention" | "awaiting" | "approved";
export type SchemeSort = "attention" | "coverage" | "name";

export const FILTER_LABEL: Record<SchemeFilter, string> = {
  all: "All",
  attention: "Needs work",
  awaiting: "Awaiting review",
  approved: "Approved",
};

export const SORT_LABEL: Record<SchemeSort, string> = {
  attention: "Needs attention first",
  coverage: "Least covered first",
  name: "Subject A–Z",
};

/**
 * Join each assignment row to its coverage verdict. `coverageRows` re-orders
 * and disambiguates, so the join is by key rather than by index.
 */
export const buildCards = (
  rows: SchemeProgressRow[],
  week: number | null,
): SchemeCard[] => {
  const coverage = new Map<string, CoverageRow>(
    coverageRows(rows, week).map((c) => [c.key, c]),
  );

  return rows.map((row) => {
    const key = `${row.subject_id}-${row.class_group_id}`;
    const c = coverage.get(key)!;
    return {
      ...row,
      key,
      planned: c.planned,
      target: c.target,
      percent:
        c.target > 0
          ? Math.min(100, Math.round((c.planned / c.target) * 100))
          : 0,
      tone: c.status,
      statusLabel: c.statusLabel,
    };
  });
};

export interface SchemeSummary {
  total: number;
  submitted: number;
  approved: number;
  awaiting: number;
  rejected: number;
  /** Not submitted, sent back, or short of the current week. */
  needsAttention: number;
  /** Planned weeks as a share of what every scheme should have by now. */
  coveragePercent: number | null;
  totalPlanned: number;
  totalTarget: number;
}

export const summarise = (cards: SchemeCard[]): SchemeSummary => {
  const totalPlanned = cards.reduce((sum, c) => sum + c.planned, 0);
  // Every assignment owes the same number of weeks, so the denominator is the
  // target times the number of schemes — not the sum of what each happens to
  // have, which would always read 100%.
  const totalTarget = cards.reduce((sum, c) => sum + c.target, 0);

  return {
    total: cards.length,
    submitted: cards.filter((c) => c.status === "submitted").length,
    approved: cards.filter((c) => c.validation_status === "APPROVED").length,
    awaiting: cards.filter(
      (c) => c.status === "submitted" && c.validation_status === "PENDING",
    ).length,
    rejected: cards.filter((c) => c.validation_status === "REJECTED").length,
    needsAttention: cards.filter((c) => c.tone !== "good").length,
    coveragePercent:
      totalTarget > 0
        ? Math.min(100, Math.round((totalPlanned / totalTarget) * 100))
        : null,
    totalPlanned,
    totalTarget,
  };
};

export const applyFilter = (
  cards: SchemeCard[],
  filter: SchemeFilter,
): SchemeCard[] => {
  switch (filter) {
    case "attention":
      return cards.filter((c) => c.tone !== "good");
    case "awaiting":
      return cards.filter(
        (c) => c.status === "submitted" && c.validation_status === "PENDING",
      );
    case "approved":
      return cards.filter((c) => c.validation_status === "APPROVED");
    default:
      return cards;
  }
};

const TONE_RANK: Record<StatusKey, number> = {
  critical: 0,
  warning: 1,
  good: 2,
};

export const applySort = (
  cards: SchemeCard[],
  sort: SchemeSort,
): SchemeCard[] => {
  const sorted = [...cards];
  switch (sort) {
    case "coverage":
      // Percent alone ties every unplanned scheme at 0; the raw week count
      // breaks the tie so the emptiest really is first.
      return sorted.sort(
        (a, b) => a.percent - b.percent || a.planned - b.planned,
      );
    case "name":
      return sorted.sort(
        (a, b) =>
          a.subject_name.localeCompare(b.subject_name) ||
          a.class_group_name.localeCompare(b.class_group_name),
      );
    default:
      return sorted.sort(
        (a, b) =>
          TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.percent - b.percent,
      );
  }
};

export const searchCards = (cards: SchemeCard[], query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter(
    (c) =>
      c.subject_name.toLowerCase().includes(q) ||
      (c.subject_code ?? "").toLowerCase().includes(q) ||
      c.class_group_name.toLowerCase().includes(q) ||
      (c.grade_name ?? "").toLowerCase().includes(q),
  );
};
