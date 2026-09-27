import logger from "../../utils/logger";
import { AttentionItem, GlanceTile, Tier } from "./contract";

// ============================================================================
// Home <- the other apps (plan §9, H3).
//
// Each app serves POST /api/integration/home-summary for the signed-in user,
// authenticated by the user's own MIS token (the app verifies it against
// MIS /auth/verify and decides scope with its own access helpers). The MIS
// backend relays the call so the browser needs no CORS entries or app URLs,
// and so everything an app returns is checked here before it reaches Home:
// shape, source, safe links, and "no names at summary depth".
// ============================================================================

export type AppSource = "taskmentor" | "attendance" | "tupo";

export interface HomeApp {
  source: AppSource;
  name: string;
  apiBaseUrl: string;
}

const APP_ENV: Array<[AppSource, string, string]> = [
  ["taskmentor", "Task Mentor", "HOME_APP_TASKMENTOR_URL"],
  ["attendance", "Discipline & Attendance", "HOME_APP_ATTENDANCE_URL"],
  ["tupo", "Tupo", "HOME_APP_TUPO_URL"],
];

/** Apps configured for this deployment (API base URLs from env). */
export function configuredApps(): HomeApp[] {
  return APP_ENV.flatMap(([source, name, env]) => {
    const raw = (process.env[env] || "").trim().replace(/\/+$/, "");
    return /^https?:\/\//.test(raw) ? [{ source, name, apiBaseUrl: raw }] : [];
  });
}

export interface AppSummaryResult {
  source: AppSource;
  status: "ok" | "unprovisioned" | "unavailable" | "unauthorized";
  message?: string;
  summary?: SanitisedSummary;
}

export interface SanitisedSummary {
  version: 1;
  source: AppSource;
  generated_at: string;
  provisioned: boolean;
  items: AttentionItem[];
  tiles: GlanceTile[];
  updates: Array<{
    id: string;
    source: AppSource;
    kind: string;
    title: string;
    body: string | null;
    severity: "info" | "success" | "warning" | "critical";
    created_at: string;
    read: boolean;
    href: string | null;
  }>;
  today_marks: Array<{ lesson_key: string; status: "done" | "missing" | "upcoming" | "not_yours"; href: string | null }>;
  comms: {
    chat_unread: number;
    mentions: number;
    mail_unread: number;
    meetings: Array<{ id: string; title: string; starts_at: string; live: boolean; href: string | null }>;
  } | null;
  app_url: string | null;
}

const TIERS: Tier[] = ["blocking", "slipping", "tidy"];

/** Namespace an app's id once, whether or not the app already prefixed it. */
const nsId = (source: AppSource, raw: string) => (raw.startsWith(`${source}:`) ? raw : `${source}:${raw}`);
const SEVERITIES = ["info", "success", "warning", "critical"] as const;
const MARKS = ["done", "missing", "upcoming", "not_yours"] as const;

const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const iso = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
/** Only absolute http(s) links leave an app -- never javascript:, data:, or relative MIS paths. */
const safeUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Validate and clamp an app's answer. Anything malformed is dropped, never passed through. */
export function sanitiseSummary(source: AppSource, raw: any, lensKeys: Set<string>): SanitisedSummary | null {
  if (!raw || typeof raw !== "object" || raw.version !== 1) return null;
  const items: AttentionItem[] = (Array.isArray(raw.items) ? raw.items : [])
    .slice(0, 40)
    .flatMap((i: any) => {
      const tier = TIERS.includes(i?.tier) ? (i.tier as Tier) : null;
      const href = safeUrl(i?.cta?.href);
      const title = str(i?.title, 200);
      if (!tier || !href || !title) return [];
      const depth = ["summary", "detail", "write"].includes(i?.depth) ? i.depth : "summary";
      const lens = lensKeys.has(i?.lens) ? i.lens : "SELF";
      return [
        {
          id: nsId(source, str(i.id, 150) || `${str(i.kind, 20)}:${lens}`),
          source,
          kind: str(i.kind, 20) || "APP",
          tier,
          lens,
          via: [],
          depth,
          count: num(i.count),
          title,
          // Summary depth never names anyone -- enforced here, whatever the app sent.
          entities: depth === "summary" ? [] : (Array.isArray(i.entities) ? i.entities : []).slice(0, 8).map((e: unknown) => str(e, 80)).filter(Boolean),
          why: str(i.why, 300),
          cta: { label: str(i.cta?.label, 40) || "Open", href, external: true },
          due_at: iso(i.due_at),
          waiting_since: iso(i.waiting_since),
        } satisfies AttentionItem,
      ];
    });
  const tiles: GlanceTile[] = (Array.isArray(raw.tiles) ? raw.tiles : []).slice(0, 4).flatMap((t: any) => {
    const label = str(t?.label, 60);
    if (!label) return [];
    return [
      {
        id: nsId(source, str(t.id, 100) || label),
        source,
        lens: lensKeys.has(t?.lens) ? t.lens : "SELF",
        label,
        value: t?.value === null || t?.value === undefined ? null : str(String(t.value), 20),
        suppressed: t?.suppressed === true,
        hint: str(t?.hint, 80) || undefined,
        status: ["good", "warning", "critical"].includes(t?.status) ? t.status : undefined,
        href: safeUrl(t?.href) ?? undefined,
      },
    ];
  });
  const updates = (Array.isArray(raw.updates) ? raw.updates : []).slice(0, 10).flatMap((u: any) => {
    const title = str(u?.title, 200);
    const created = iso(u?.created_at);
    if (!title || !created) return [];
    return [
      {
        id: nsId(source, str(u.id, 100) || created),
        source,
        kind: str(u.kind, 40),
        title,
        body: str(u.body, 300) || null,
        severity: SEVERITIES.includes(u?.severity) ? u.severity : "info",
        created_at: created,
        read: u?.read === true,
        href: safeUrl(u?.href),
      },
    ];
  });
  const today_marks = (Array.isArray(raw.today_marks) ? raw.today_marks : []).slice(0, 40).flatMap((m: any) =>
    typeof m?.lesson_key === "string" && MARKS.includes(m?.status)
      ? [{ lesson_key: m.lesson_key.slice(0, 80), status: m.status, href: safeUrl(m.href) }]
      : [],
  );
  const c = raw.comms;
  const comms =
    c && typeof c === "object"
      ? {
          chat_unread: num(c.chat_unread),
          mentions: num(c.mentions),
          mail_unread: num(c.mail_unread),
          meetings: (Array.isArray(c.meetings) ? c.meetings : []).slice(0, 6).flatMap((m: any) => {
            const starts = iso(m?.starts_at);
            return starts && str(m?.title)
              ? [{ id: str(String(m.id), 60), title: str(m.title, 120), starts_at: starts, live: m.live === true, href: safeUrl(m.href) }]
              : [];
          }),
        }
      : null;
  return {
    version: 1,
    source,
    generated_at: iso(raw.generated_at) ?? new Date().toISOString(),
    provisioned: raw.provisioned !== false,
    items,
    tiles,
    updates,
    today_marks,
    comms,
    app_url: safeUrl(raw.app_url),
  };
}

/** Read per call, like configuredApps(), so configuration changes need no restart of this module. */
const timeoutMs = () => Number(process.env.HOME_APP_TIMEOUT_MS) || 8000;

/** Relay one app's summary for the user, with the user's own MIS token. Never throws. */
export async function fetchAppSummary(
  app: HomeApp,
  misToken: string,
  body: unknown,
  lensKeys: Set<string>,
): Promise<AppSummaryResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const res = await fetch(`${app.apiBaseUrl}/api/integration/home-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${misToken}` },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { source: app.source, status: "unauthorized", message: `${app.name} did not accept your session` };
    }
    if (!res.ok) {
      return { source: app.source, status: "unavailable", message: `${app.name} answered ${res.status}` };
    }
    const json: any = await res.json().catch(() => null);
    const summary = sanitiseSummary(app.source, json?.data ?? json, lensKeys);
    if (!summary) return { source: app.source, status: "unavailable", message: `${app.name} sent an unexpected answer` };
    return { source: app.source, status: summary.provisioned ? "ok" : "unprovisioned", summary };
  } catch (error) {
    const aborted = (error as any)?.name === "AbortError";
    logger.warn("Home app summary failed", {
      app: app.source,
      reason: aborted ? "timeout" : error instanceof Error ? error.message : String(error),
    });
    return {
      source: app.source,
      status: "unavailable",
      message: aborted ? `${app.name} took too long to answer` : `${app.name} could not be reached`,
    };
  } finally {
    clearTimeout(timer);
  }
}
