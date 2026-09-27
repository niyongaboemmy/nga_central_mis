import React from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Calendar,
  ChartNoAxesColumn,
  Check,
  ClipboardList,
  FileText,
  Gauge,
  Layers,
  Mail,
  MessageCircle,
  Play,
  Shield,
  UserPlus,
  Users,
  Video,
  Zap,
} from "lucide-react";
import type { GlanceTile, QuickAction } from "./contract";
import type { AppState } from "./appContract";
import { Card, CardHeader, SOURCE_LABEL } from "./ui";
import { type MergedApps, relativeTime } from "./merge";

// ─── At a glance ────────────────────────────────────────────────────────────

const STATUS_DOT = {
  good: "bg-green-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
} as const;

const TILE_CAP = 6;

export const GlanceTiles: React.FC<{ tiles: GlanceTile[]; insightsHref?: string; wide?: boolean }> = ({
  tiles,
  insightsHref,
  wide = false,
}) => {
  const [all, setAll] = React.useState(false);
  if (tiles.length === 0) return null;
  // Critical first, then warning, so a capped grid never hides the red one.
  const rank = { critical: 0, warning: 1, good: 2 } as const;
  const ordered = [...tiles].sort((a, b) => (a.status ? rank[a.status] : 3) - (b.status ? rank[b.status] : 3));
  const shown = all ? ordered : ordered.slice(0, TILE_CAP);
  return (
    <Card aria-labelledby="home-glance">
      <CardHeader
        id="home-glance"
        icon={<Gauge className="w-4 h-4" />}
        title="At a glance"
        action={
          insightsHref ? (
            <Link to={insightsHref} className="inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Open insights →
            </Link>
          ) : undefined
        }
      />
      {/* wide: a full-width row under the greeting, so the facts are read first
          and the two columns below are left for what to do about them. The
          tiles share the row whatever their number (auto-fit), so two tiles do
          not sit in the left third of an empty card. */}
      <ul className={`grid gap-2 px-4 pb-4 ${wide ? "grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]" : "grid-cols-2"}`}>
        {shown.map((t) => {
          const body = (
            <>
              <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                {t.status && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[t.status]}`} aria-hidden />}
                <span className="truncate">{t.label}</span>
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-text-primary-light dark:text-text-primary-dark">
                {t.suppressed ? "<5" : (t.value ?? "—")}
              </p>
              {t.hint && <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">{t.hint}</p>}
            </>
          );
          const cls =
            "block h-full rounded-2xl bg-surface-light dark:bg-surface-dark/60 px-3 py-2.5 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
          return (
            <li key={t.id}>
              {t.href ? (
                <Link to={t.href} className={cls}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {tiles.length > TILE_CAP && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mx-4 mb-3 -mt-1 inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {all ? "Show fewer" : `Show ${tiles.length - TILE_CAP} more`}
        </button>
      )}
    </Card>
  );
};

// ─── Quick actions ──────────────────────────────────────────────────────────

const ACTION_ICON: Record<string, React.ReactNode> = {
  clipboard: <ClipboardList className="w-4 h-4" />,
  note: <FileText className="w-4 h-4" />,
  calendar: <Calendar className="w-4 h-4" />,
  chart: <ChartNoAxesColumn className="w-4 h-4" />,
  play: <Play className="w-4 h-4" />,
  book: <BookOpen className="w-4 h-4" />,
  layers: <Layers className="w-4 h-4" />,
  message: <MessageCircle className="w-4 h-4" />,
  users: <Users className="w-4 h-4" />,
  check: <Check className="w-4 h-4" />,
  shield: <Shield className="w-4 h-4" />,
  "user-plus": <UserPlus className="w-4 h-4" />,
};

export const QuickActions: React.FC<{ actions: QuickAction[] }> = ({ actions }) => {
  if (actions.length === 0) return null;
  return (
    <Card aria-labelledby="home-actions">
      <CardHeader id="home-actions" icon={<Zap className="w-4 h-4" />} title="Quick actions" />
      <ul className="grid grid-cols-1 gap-1.5 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {actions.map((a) => (
          <li key={a.id}>
            <Link
              to={a.href}
              className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-border-light dark:border-border-dark/50 px-3 py-2 text-sm font-medium text-text-primary-light dark:text-text-primary-dark transition-colors hover:border-blue-300 hover:text-blue-700 dark:hover:border-blue-800/60 dark:hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className="text-slate-600 dark:text-slate-300">{ACTION_ICON[a.icon] ?? <Zap className="w-4 h-4" />}</span>
              <span className="truncate">{a.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
};

// ─── Updates (notifications from every module and app) ───────────────────────

export interface UpdateEntry {
  id: string;
  title: string;
  created_at: string;
  unread: boolean;
  source: string;
  onOpen: () => void;
}

export const UpdatesCard: React.FC<{
  entries: UpdateEntry[];
  unreadCount: number;
  onMarkAll: () => void;
}> = ({ entries, unreadCount, onMarkAll }) => {
  const recent = entries.slice(0, 8);
  return (
    <Card aria-labelledby="home-updates">
      <CardHeader
        id="home-updates"
        icon={<Bell className="w-4 h-4" />}
        title="Updates"
        subtitle={unreadCount ? `${unreadCount} unread` : "You're up to date"}
        action={
          unreadCount > 0 ? (
            <button type="button" onClick={onMarkAll} className="inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Mark all read
            </button>
          ) : undefined
        }
      />
      {recent.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-600 dark:text-slate-300">
          Shared documents, published lessons and news from your apps will appear here.
        </p>
      ) : (
        <ul className="px-3 pb-3">
          {recent.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={n.onOpen}
                className="flex w-full items-start gap-2.5 rounded-2xl px-2.5 py-2 text-left hover:bg-surface-light dark:hover:bg-surface-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className={`mt-1.5 w-2 h-2 flex-shrink-0 rounded-full ${n.unread ? "bg-blue-500" : "bg-transparent"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm truncate ${
                      n.unread ? "font-semibold text-text-primary-light dark:text-text-primary-dark" : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {n.title}
                  </span>
                  <span className="block text-[11px] text-slate-600 dark:text-slate-300">
                    {SOURCE_LABEL[n.source] ?? n.source} · {relativeTime(n.created_at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

// ─── Messages & meetings (Tupo) ─────────────────────────────────────────────

export const CommsCard: React.FC<{ comms: MergedApps["comms"]; now: Date }> = ({ comms, now }) => {
  if (!comms) return null;
  const open = (path = "") => (comms.app_url ? `${comms.app_url.replace(/\/$/, "")}${path}` : null);
  const Stat: React.FC<{ icon: React.ReactNode; label: string; value: number; hint?: string; href: string | null }> = ({
    icon,
    label,
    value,
    hint,
    href,
  }) => {
    const body = (
      <>
        <span className="text-slate-600 dark:text-slate-300">{icon}</span>
        <span className="min-w-0 flex-1 text-sm text-text-primary-light dark:text-text-primary-dark">
          {label}
          {hint && <span className="ml-1 text-xs text-slate-600 dark:text-slate-300">{hint}</span>}
        </span>
        <span
          className={`rounded-full px-2 text-xs font-semibold tabular-nums ${
            value > 0 ? "bg-blue-600 text-white" : "bg-surface-light text-text-secondary-light dark:bg-surface-dark dark:text-text-secondary-dark"
          }`}
        >
          {value}
        </span>
      </>
    );
    const cls = "flex min-h-[44px] items-center gap-2.5 rounded-2xl px-3 py-2 hover:bg-surface-light dark:hover:bg-surface-dark";
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    ) : (
      <div className={cls}>{body}</div>
    );
  };
  return (
    <Card aria-labelledby="home-comms">
      <CardHeader id="home-comms" icon={<MessageCircle className="w-4 h-4" />} title="Messages & meetings" subtitle="From Tupo" />
      <div className="px-2 pb-3">
        <Stat
          icon={<MessageCircle className="w-4 h-4" />}
          label="Unread messages"
          value={comms.chat_unread}
          hint={comms.mentions ? `· ${comms.mentions} mention${comms.mentions === 1 ? "" : "s"}` : undefined}
          href={open("/app/chat")}
        />
        <Stat icon={<Mail className="w-4 h-4" />} label="Unread mail" value={comms.mail_unread} href={open("/app/mail")} />
        {comms.meetings.length > 0 && (
          <ul className="mt-1 space-y-1 px-1">
            {comms.meetings.map((m) => {
              const start = new Date(m.starts_at);
              return (
                <li key={m.id} className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5">
                  <Video className={`w-4 h-4 flex-shrink-0 ${m.live ? "text-red-500" : "text-slate-600 dark:text-slate-300"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-primary-light dark:text-text-primary-dark">{m.title}</span>
                    <span className="block text-[11px] text-slate-600 dark:text-slate-300">
                      {m.live ? "Live now" : start > now ? `Starts ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Today"}
                    </span>
                  </span>
                  {m.href && (
                    <a
                      href={m.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rounded-xl px-2.5 py-1 text-xs font-semibold ${m.live ? "bg-red-600 text-white hover:bg-red-700" : "bg-surface-light dark:bg-surface-dark text-text-primary-light dark:text-text-primary-dark"}`}
                    >
                      {m.live ? "Join" : "Open"}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
};

// ─── Source health (header) ─────────────────────────────────────────────────

const HEALTH: Record<string, { dot: string; text: string }> = {
  ok: { dot: "bg-green-500", text: "up to date" },
  loading: { dot: "bg-slate-300 dark:bg-slate-600 animate-pulse motion-reduce:animate-none", text: "loading" },
  unprovisioned: { dot: "bg-slate-400", text: "open it once to connect it to Home" },
  unauthorized: { dot: "bg-amber-500", text: "didn't accept your session — open it to sign in" },
  unavailable: { dot: "bg-amber-500", text: "couldn't be reached right now" },
};

export const SourceHealth: React.FC<{ states: AppState[] }> = ({ states }) => {
  if (states.length === 0) return null;
  const down = states.filter((s) => s.status === "unavailable" || s.status === "unauthorized").map((s) => s.name);
  const sentence =
    down.length > 0
      ? `${down.join(", ")} ${down.length === 1 ? "isn't" : "aren't"} answering right now — ${down.length === 1 ? "its" : "their"} items aren't shown here yet.`
      : "All connected apps are answering.";
  // A status line, not a warning under the greeting: it sits beside "Updated"
  // as one short phrase, with the full sentence on hover and for screen readers.
  return (
    <div className="relative" title={sentence}>
      <span aria-hidden className="inline-flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${down.length > 0 ? "bg-amber-500" : "bg-green-500"}`} />
        {down.length > 0
          ? `${down.length} ${down.length === 1 ? "app" : "apps"} offline`
          : "All apps connected"}
      </span>
    <ul className="sr-only" aria-label="Connected apps">
      <li className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden /> MIS
      </li>
      {states.map((s) => {
        const h = HEALTH[s.status] ?? HEALTH.unavailable;
        const message = "message" in s && s.message ? s.message : `${s.name} ${h.text}`;
        return (
          <li key={s.source} className="inline-flex items-center gap-1.5" title={message}>
            <span className={`w-2 h-2 rounded-full ${h.dot}`} aria-hidden />
            {s.name}
            <span className="sr-only">: {message}</span>
          </li>
        );
      })}
    </ul>
    {down.length > 0 && <p className="sr-only">{sentence}</p>}
    </div>
  );
};
