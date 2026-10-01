import { sql } from "drizzle-orm";
import { db } from "../../db";
import { AccessManifestRow, DepartmentSubject } from "../../db/accessSchema";
import {
  AccessSnapshot,
  DEFAULT_MIN_COHORT,
  Depth,
  depthRank,
  entryCovers,
  groupByAllowed,
  InsightDef,
  Manifest,
  parseNode,
  scopeFor,
  ScopeType,
  suppressSmallCohorts,
} from "../../vendor/nga-access";
import { MIS_MANIFEST } from "../../access/manifest";
import { coversNode, NodeRef } from "./delegation";
import { APP_LABELS } from "../../access/apps";

/**
 * Leadership Insights (plan §8): aggregate-only views. A viewer with
 * `summary` depth on a metric's capability sees programme / grade / class /
 * subject aggregates at the nodes their grants cover -- never names, never
 * per-person rows -- and groups smaller than MIN_COHORT are suppressed.
 *
 * MIS computes its own metrics here; the other apps' metrics are listed (from
 * their published manifests) so the hub can fetch them from the app itself.
 */

export const MIN_COHORT = Number(process.env.ACCESS_MIN_COHORT) || DEFAULT_MIN_COHORT;

export const MIS_INSIGHTS: Record<string, InsightDef & { unit: string }> = {
  "curriculum.sow_validation": {
    label: "Schemes of work validated",
    capability: "VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST",
    minDepth: "summary",
    levels: ["SCHOOL", "PROGRAM", "GRADE", "CLASS_GROUP", "DEPARTMENT"],
    unit: "%",
  },
  "teaching.lesson_reports": {
    label: "Reported lessons delivered",
    capability: "VIEW_REPORTS",
    minDepth: "summary",
    levels: ["SCHOOL", "PROGRAM", "GRADE", "CLASS_GROUP", "DEPARTMENT"],
    unit: "%",
  },
  // Platform usage (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §11): who in the area actually
  // uses the platform. Aggregates only; small groups are suppressed like every insight.
  "usage.student_active_rate": {
    label: "Students active on the platform (last 7 days)",
    capability: "USAGE_INSIGHTS_VIEW",
    minDepth: "summary",
    levels: ["SCHOOL", "PROGRAM", "GRADE", "CLASS_GROUP"],
    unit: "%",
  },
  "usage.teacher_active_rate": {
    label: "Teachers active on the platform (last 7 days)",
    capability: "USAGE_INSIGHTS_VIEW",
    minDepth: "summary",
    levels: ["SCHOOL", "PROGRAM", "GRADE", "CLASS_GROUP"],
    unit: "%",
  },
  "usage.student_dormant_rate": {
    label: "Students with no activity for 14 days",
    capability: "USAGE_INSIGHTS_VIEW",
    minDepth: "summary",
    levels: ["SCHOOL", "PROGRAM", "GRADE", "CLASS_GROUP"],
    unit: "%",
  },
  "elearning.progress": {
    label: "E-learning courses published",
    capability: "VIEW_ALL_COURSES",
    minDepth: "summary",
    levels: ["SCHOOL", "PROGRAM", "GRADE", "CLASS_GROUP", "DEPARTMENT"],
    unit: "%",
  },
};

/** Default grouping one level below the node. */
export const CHILD_LEVEL: Record<string, string> = {
  SCHOOL: "PROGRAM",
  PLATFORM: "PROGRAM",
  PROGRAM: "GRADE",
  GRADE: "CLASS_GROUP",
  CLASS_GROUP: "SUBJECT",
  DEPARTMENT: "SUBJECT",
  SUBJECT_CLASS: "SUBJECT",
};

interface BaseRow {
  program_id: number;
  program_name: string;
  grade_id: number;
  grade_name: string;
  class_group_id: number;
  class_group_name: string;
  subject_id: number | null;
  subject_name: string | null;
  n: number;
  hit: number;
}

const BASE_SQL: Record<string, ReturnType<typeof sql>> = {
  "curriculum.sow_validation": sql`
    SELECT p.program_id, p.name AS program_name, g.grade_id, g.name AS grade_name,
           cg.class_group_id, cg.name AS class_group_name, s.subject_id, s.name AS subject_name,
           COUNT(*) AS n, SUM(sw.validation_status = 'APPROVED') AS hit
    FROM SchemeOfWork sw
    JOIN ClassGroup cg ON cg.class_group_id = sw.class_group_id
    JOIN Grade g ON g.grade_id = cg.grade_id
    JOIN Program p ON p.program_id = g.program_id
    LEFT JOIN Subject s ON s.subject_id = sw.subject_id
    GROUP BY p.program_id, p.name, g.grade_id, g.name, cg.class_group_id, cg.name, s.subject_id, s.name`,
  "teaching.lesson_reports": sql`
    SELECT p.program_id, p.name AS program_name, g.grade_id, g.name AS grade_name,
           cg.class_group_id, cg.name AS class_group_name, s.subject_id, s.name AS subject_name,
           COUNT(*) AS n, SUM(lr.status = 'DELIVERED') AS hit
    FROM LessonReport lr
    JOIN ClassGroup cg ON cg.class_group_id = lr.class_group_id
    JOIN Grade g ON g.grade_id = cg.grade_id
    JOIN Program p ON p.program_id = g.program_id
    LEFT JOIN Subject s ON s.subject_id = lr.subject_id
    WHERE lr.delivery_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
    GROUP BY p.program_id, p.name, g.grade_id, g.name, cg.class_group_id, cg.name, s.subject_id, s.name`,
  "usage.student_active_rate": sql`
    SELECT p.program_id, p.name AS program_name, g.grade_id, g.name AS grade_name,
           cg.class_group_id, cg.name AS class_group_name, NULL AS subject_id, NULL AS subject_name,
           COUNT(DISTINCT scg.user_id) AS n, COUNT(DISTINCT a.user_id) AS hit
    FROM StudentClassGroup scg
    JOIN AcademicYear ay ON ay.academic_year_id = scg.academic_year_id AND ay.is_current = 1
    JOIN ClassGroup cg ON cg.class_group_id = scg.class_group_id
    JOIN Grade g ON g.grade_id = cg.grade_id
    JOIN Program p ON p.program_id = g.program_id
    LEFT JOIN (SELECT DISTINCT user_id FROM AnalyticsUserDay WHERE is_active = 1 AND day >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) a ON a.user_id = scg.user_id
    WHERE scg.status = 'ACTIVE'
    GROUP BY p.program_id, p.name, g.grade_id, g.name, cg.class_group_id, cg.name`,
  "usage.teacher_active_rate": sql`
    SELECT p.program_id, p.name AS program_name, g.grade_id, g.name AS grade_name,
           cg.class_group_id, cg.name AS class_group_name, s.subject_id, s.name AS subject_name,
           COUNT(DISTINCT tsa.user_id) AS n, COUNT(DISTINCT a.user_id) AS hit
    FROM TeacherSubjectAssignment tsa
    JOIN AcademicYear ay ON ay.academic_year_id = tsa.academic_year_id AND ay.is_current = 1
    JOIN ClassGroup cg ON cg.class_group_id = tsa.class_group_id
    JOIN Grade g ON g.grade_id = cg.grade_id
    JOIN Program p ON p.program_id = g.program_id
    LEFT JOIN Subject s ON s.subject_id = tsa.subject_id
    LEFT JOIN (SELECT DISTINCT user_id FROM AnalyticsUserDay WHERE is_active = 1 AND day >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) a ON a.user_id = tsa.user_id
    GROUP BY p.program_id, p.name, g.grade_id, g.name, cg.class_group_id, cg.name, s.subject_id, s.name`,
  "usage.student_dormant_rate": sql`
    SELECT p.program_id, p.name AS program_name, g.grade_id, g.name AS grade_name,
           cg.class_group_id, cg.name AS class_group_name, NULL AS subject_id, NULL AS subject_name,
           COUNT(DISTINCT scg.user_id) AS n, COUNT(DISTINCT IF(a.user_id IS NULL, scg.user_id, NULL)) AS hit
    FROM StudentClassGroup scg
    JOIN AcademicYear ay ON ay.academic_year_id = scg.academic_year_id AND ay.is_current = 1
    JOIN ClassGroup cg ON cg.class_group_id = scg.class_group_id
    JOIN Grade g ON g.grade_id = cg.grade_id
    JOIN Program p ON p.program_id = g.program_id
    LEFT JOIN (SELECT DISTINCT user_id FROM AnalyticsUserDay WHERE day >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)) a ON a.user_id = scg.user_id
    WHERE scg.status = 'ACTIVE'
    GROUP BY p.program_id, p.name, g.grade_id, g.name, cg.class_group_id, cg.name`,
  "elearning.progress": sql`
    SELECT p.program_id, p.name AS program_name, g.grade_id, g.name AS grade_name,
           cg.class_group_id, cg.name AS class_group_name, s.subject_id, s.name AS subject_name,
           COUNT(*) AS n, SUM(c.status = 'PUBLISHED') AS hit
    FROM Course c
    JOIN ClassGroup cg ON cg.class_group_id = c.class_group_id
    JOIN Grade g ON g.grade_id = cg.grade_id
    JOIN Program p ON p.program_id = g.program_id
    LEFT JOIN Subject s ON s.subject_id = c.subject_id
    WHERE c.status <> 'ARCHIVED'
    GROUP BY p.program_id, p.name, g.grade_id, g.name, cg.class_group_id, cg.name, s.subject_id, s.name`,
};

export class InsightError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Widgets the viewer may open at a node: MIS metrics + other apps' published ones. */
export async function listWidgets(all: AccessSnapshot, node: NodeRef) {
  const manifests: Manifest[] = [MIS_MANIFEST];
  const rows = await db.select({ manifest: AccessManifestRow.manifest }).from(AccessManifestRow);
  for (const r of rows) {
    const m = JSON.parse(r.manifest) as Manifest;
    if (m.app !== "mis") manifests.push(m);
  }
  const out: Array<{ app: string; app_label: string; metric: string; label: string; source: "mis" | "app" }> = [];
  for (const m of manifests) {
    const defs = m.app === "mis" ? MIS_INSIGHTS : m.insights ?? {};
    for (const [metric, def] of Object.entries(defs)) {
      if (!def.levels.includes(node.scopeType)) continue;
      const cap = m.app === "mis" ? def.capability : `${m.app}:${def.capability}`;
      if (!coversNode(all, cap, node, def.minDepth)) continue;
      out.push({ app: m.app, app_label: APP_LABELS[m.app] ?? m.name, metric, label: def.label, source: m.app === "mis" ? "mis" : "app" });
    }
  }
  return out;
}

export interface InsightResult {
  metric: string;
  label: string;
  unit: string;
  node: string;
  groupBy: string;
  depth: Depth;
  min_cohort: number;
  rows: Array<{ key: number | string; label: string; value: number | null; n: number; suppressed: boolean }>;
  total: { value: number | null; n: number; suppressed: boolean };
  generated_at: string;
}

/** Compute one MIS metric for the viewer at a node. */
export async function computeMisInsight(
  mis: AccessSnapshot,
  metric: string,
  nodeParam: string,
  groupByParam?: string,
): Promise<InsightResult> {
  const def = MIS_INSIGHTS[metric];
  if (!def) throw new InsightError(404, "Unknown metric");
  const parsed = parseNode(nodeParam || "SCHOOL");
  if (!parsed) throw new InsightError(400, "Invalid node");
  const node: NodeRef = {
    scopeType: parsed.type,
    scopeId: parsed.target.programId ?? parsed.target.departmentId ?? parsed.target.gradeId ?? parsed.target.subjectId ?? parsed.target.classGroupId ?? null,
    scopeId2: parsed.type === "SUBJECT_CLASS" ? parsed.target.classGroupId ?? null : null,
  };
  if (!def.levels.includes(parsed.type)) throw new InsightError(400, `This metric is not available at ${parsed.type}`);
  if (!coversNode(mis, def.capability, node, def.minDepth)) throw new InsightError(403, "Forbidden");

  // Depth at this node decides how fine the grouping may be.
  const entries = mis.caps[def.capability] ?? [];
  const depth = entries.reduce<Depth>((best, e) => (depthRank(e.depth) > depthRank(best) ? (e.depth as Depth) : best), "summary");
  const groupBy = (groupByParam || CHILD_LEVEL[parsed.type] || "PROGRAM").toUpperCase();
  if (!["PROGRAM", "GRADE", "CLASS_GROUP", "SUBJECT"].includes(groupBy)) throw new InsightError(400, "Invalid groupBy");
  if (!groupByAllowed(depth, groupBy)) throw new InsightError(403, "Grouping not allowed at your depth");

  const raw = ((await db.execute(BASE_SQL[metric])) as any)[0] as BaseRow[];
  const deptSubjects =
    parsed.type === "DEPARTMENT"
      ? new Set(
          (
            await db
              .select({ subject_id: DepartmentSubject.subject_id })
              .from(DepartmentSubject)
              .where(sql`${DepartmentSubject.department_id} = ${node.scopeId}`)
          ).map((r) => r.subject_id),
        )
      : null;

  // Only rows inside the node AND inside the viewer's own scope for the capability.
  const viewerScope = scopeFor(mis, def.capability, def.minDepth);
  const inNode = (r: BaseRow) => {
    switch (parsed.type) {
      case "PROGRAM":
        return r.program_id === parsed.target.programId;
      case "GRADE":
        return r.grade_id === parsed.target.gradeId;
      case "CLASS_GROUP":
        return r.class_group_id === parsed.target.classGroupId;
      case "SUBJECT_CLASS":
        return r.class_group_id === parsed.target.classGroupId && r.subject_id === parsed.target.subjectId;
      case "DEPARTMENT":
        return r.subject_id != null && deptSubjects!.has(r.subject_id);
      default:
        return true;
    }
  };
  const visible = raw.filter(
    (r) =>
      inNode(r) &&
      !!viewerScope &&
      entryCovers(viewerScope, { classGroupId: r.class_group_id, subjectId: r.subject_id ?? undefined }),
  );

  const keyOf: Record<string, (r: BaseRow) => [number | string, string]> = {
    PROGRAM: (r) => [r.program_id, r.program_name],
    GRADE: (r) => [r.grade_id, r.grade_name],
    CLASS_GROUP: (r) => [r.class_group_id, r.class_group_name],
    SUBJECT: (r) => [r.subject_id ?? "none", r.subject_name ?? "No subject"],
  };
  const groups = new Map<string, { key: number | string; label: string; n: number; hit: number }>();
  let n = 0;
  let hit = 0;
  for (const r of visible) {
    const [key, label] = keyOf[groupBy](r);
    const g = groups.get(String(key)) ?? { key, label, n: 0, hit: 0 };
    g.n += Number(r.n);
    g.hit += Number(r.hit);
    groups.set(String(key), g);
    n += Number(r.n);
    hit += Number(r.hit);
  }
  const pct = (h: number, t: number) => (t > 0 ? Math.round((h / t) * 1000) / 10 : null);
  const rows = suppressSmallCohorts(
    [...groups.values()]
      .map((g) => ({ key: g.key, label: g.label, n: g.n, value: pct(g.hit, g.n) }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label))),
    MIN_COHORT,
  ) as InsightResult["rows"];
  const [total] = suppressSmallCohorts([{ n, value: pct(hit, n), suppressed: false }], MIN_COHORT);

  return {
    metric,
    label: def.label,
    unit: def.unit,
    node: nodeParam || "SCHOOL",
    groupBy,
    depth,
    min_cohort: MIN_COHORT,
    rows,
    total: { value: total.value ?? null, n, suppressed: !!total.suppressed },
    generated_at: new Date().toISOString(),
  };
}

export type { ScopeType };
