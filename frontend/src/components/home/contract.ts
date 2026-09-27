/**
 * Home (unified cross-module overview) -- wire contract.
 * HOME_OVERVIEW_IMPLEMENTATION_PLAN.md §7.4. Keep in step with
 * backend/src/services/home/contract.ts.
 */

export type HomeSource = "mis" | "taskmentor" | "attendance" | "tupo";
export type Tier = "blocking" | "slipping" | "tidy";

/** "SELF" | "TEACHING" | "MENTEES" | "CHILDREN" | "CLASS_GROUP:7" | "PROGRAM:2" | "SCHOOL" | ... */
export type LensKey = string;

export type LensType =
  | "SELF"
  | "TEACHING"
  | "MENTEES"
  | "CHILDREN"
  | "CLASS_GROUP"
  | "GRADE"
  | "DEPARTMENT"
  | "PROGRAM"
  | "SCHOOL"
  | "PLATFORM";

export interface HomeLens {
  key: LensKey;
  type: LensType;
  label: string;
  /** The position that puts this lens on the page, for "why am I seeing this". */
  reason: string;
  via: number[];
}

export interface AttentionItem {
  /** Stable across refreshes: `${source}:${kind}:${lens}[:${scope}]`. */
  id: string;
  source: HomeSource;
  /** Catalog id (plan §6), e.g. "T-04". */
  kind: string;
  tier: Tier;
  lens: LensKey;
  via: number[];
  /** What the item was computed at; the client refuses entity chips at "summary". */
  depth: "summary" | "detail" | "write";
  count: number;
  title: string;
  entities: string[];
  why: string;
  cta: { label: string; href: string; external?: boolean };
  due_at?: string | null;
  waiting_since?: string | null;
  suppresses?: string[];
}

export interface GlanceTile {
  id: string;
  source: HomeSource;
  lens: LensKey;
  label: string;
  value: string | null;
  suppressed?: boolean;
  hint?: string;
  status?: "good" | "warning" | "critical";
  href?: string;
  /** Insights metric id when the tile is an Insights metric. */
  metric?: string;
}

export interface TodayLesson {
  lesson_key: string;
  kind: "teaching" | "learning";
  slot_id: number;
  subject_id: number;
  subject_name: string | null;
  class_group_id: number | null;
  class_group_name: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  color: string | null;
  teacher_name?: string | null;
  plan?: "done" | "missing";
  report?: "done" | "pending" | "upcoming";
  href: string;
}

export interface TodayActivity {
  id: number;
  title: string;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
}

export interface QuickAction {
  id: string;
  label: string;
  href: string;
  icon: string;
  lens: LensKey;
}

export interface HomeOverview {
  version: 1;
  viewer: {
    user_id: number;
    first_name: string | null;
    last_name: string | null;
    persona: string | null;
    preview_of?: number;
  };
  access: {
    /** Where the decisions came from: today's permissions or the v2 snapshot. */
    source: "legacy" | "v2";
    mode: "off" | "shadow" | "enforce";
    version: number;
  };
  period: {
    academic_year_id: number | null;
    academic_year_name: string | null;
    academic_term_id: number | null;
    academic_term_name: string | null;
    term_start_date: string | null;
    term_end_date: string | null;
    week_of_term: number | null;
    weeks_in_term: number | null;
  };
  lenses: HomeLens[];
  default_lens: LensKey | "EVERYTHING";
  today: {
    date: string;
    server_now: string;
    day_of_week: number;
    lessons: TodayLesson[];
    activities: TodayActivity[];
    next_teaching_day: { date: string; day_of_week: number; lessons: number } | null;
  };
  items: AttentionItem[];
  tiles: GlanceTile[];
  quick_actions: QuickAction[];
  /** Other apps connected to Home; the page asks each for its summary (POST /home/apps/:source/summary). */
  apps: Array<{ source: "taskmentor" | "attendance" | "tupo"; name: string }>;
  degraded: string[];
  generated_at: string;
}
