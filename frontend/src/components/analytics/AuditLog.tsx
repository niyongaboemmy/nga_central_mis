import React, { useEffect, useMemo, useState } from "react";
import UserAvatar from "../ui/UserAvatar";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bot,
  CalendarRange,
  Download,
  Eye,
  FilePlus2,
  FileText,
  KeyRound,
  LogIn,
  PencilLine,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { auditApi, type AuditRow, type AuditVerb } from "../../api/systems";
import { useAccess } from "../../hooks/useAccess";
import { useTheme } from "../../contexts/ThemeContext";
import Modal from "../ui/Modal";
import { SearchSelect } from "../ui/SearchSelect";
import { Empty, Panel, btnGhost, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { useReport } from "./useReport";
import { BarList, ChartPanel, DataTable, Donut, Heatmap, Pager, Sparkline, TrendLines, fmtInt } from "./charts";
import { Kpi, Segmented } from "./common";
import { SkeletonDonut, SkeletonKpis, SkeletonList, SkeletonPanel } from "./Skeleton";

/**
 * Audit log: what people changed in the MIS -- created, edited, deleted, published,
 * permission changes, sign-ins (ActivityLog). Lives in Usage & Monitoring next to the
 * usage reports: those say what people looked at, this says what they did.
 *
 * Every figure is computed by the server over the whole filtered range; filters live
 * in the URL so a view can be shared and Back restores it.
 */

// ---------------------------------------------------------------------------
// Kinds of action: icon + word on every badge, never colour alone.
// ---------------------------------------------------------------------------
export const VERB_META: Record<AuditVerb, { label: string; icon: LucideIcon; badge: string; light: string; dark: string }> = {
  CREATE: { label: "Created", icon: FilePlus2, badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-400/30", light: "#1baf7a", dark: "#199e70" },
  UPDATE: { label: "Edited", icon: PencilLine, badge: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-400/30", light: "#2a78d6", dark: "#3987e5" },
  DELETE: { label: "Deleted", icon: Trash2, badge: "bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-400/30", light: "#e0475e", dark: "#e5576c" },
  PUBLISH: { label: "Published", icon: Send, badge: "bg-violet-50 text-violet-800 ring-violet-600/20 dark:bg-violet-900/30 dark:text-violet-200 dark:ring-violet-400/30", light: "#8b5cf6", dark: "#9d76f7" },
  LOGIN: { label: "Sign-in", icon: LogIn, badge: "bg-slate-100 text-slate-800 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-500/40", light: "#64748b", dark: "#94a3b8" },
  SECURITY: { label: "Access & security", icon: KeyRound, badge: "bg-amber-50 text-amber-900 ring-amber-600/25 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-400/30", light: "#eda100", dark: "#c98500" },
  AI: { label: "AI generated", icon: Bot, badge: "bg-indigo-50 text-indigo-800 ring-indigo-600/20 dark:bg-indigo-900/30 dark:text-indigo-200 dark:ring-indigo-400/30", light: "#4f46e5", dark: "#818cf8" },
  OTHER: { label: "Other", icon: FileText, badge: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/40", light: "#94a3b8", dark: "#64748b" },
};
const VERB_ORDER: AuditVerb[] = ["CREATE", "UPDATE", "DELETE", "PUBLISH", "SECURITY", "LOGIN", "AI", "OTHER"];

export const VerbBadge: React.FC<{ verb: AuditVerb; compact?: boolean }> = ({ verb, compact }) => {
  const m = VERB_META[verb] ?? VERB_META.OTHER;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${m.badge}`}>
      <m.icon className="w-3 h-3" aria-hidden />
      {compact ? <span className="sr-only">{m.label}</span> : m.label}
    </span>
  );
};

/** LESSON_NOTE_AI_GENERATE → "Lesson note AI generate". */
export const humanAction = (a: string) => {
  const w = a.toLowerCase().split("_").map((x) => (["ai", "sso", "otp", "pdf", "lo"].includes(x) ? x.toUpperCase() : x));
  const s = w.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const humanEntity = (e: string | null) => (e ? e.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2") : "—");
const fmtAt = (at: string, withDate = true) => {
  const d = new Date(at.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return at;
  return withDate
    ? d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const bucketText = (b: string, gran: "hour" | "day") => {
  const d = new Date(b.length === 10 ? `${b}T00:00:00` : b.replace(" ", "T"));
  return gran === "hour"
    ? d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
};

// ---------------------------------------------------------------------------
// URL-backed filters
// ---------------------------------------------------------------------------
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => ymd(new Date());
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));
const PRESETS = [
  { key: "today", label: "Today", from: () => today() },
  { key: "yesterday", label: "Yesterday", from: () => daysAgo(1), to: () => daysAgo(1) },
  { key: "7d", label: "Last 7 days", from: () => daysAgo(6) },
  { key: "30d", label: "Last 30 days", from: () => daysAgo(29) },
  { key: "90d", label: "Last 90 days", from: () => daysAgo(89) },
] as const;

function useAuditQuery() {
  const [params, setParams] = useSearchParams();
  const preset = params.get("preset") ?? (params.get("from") ? "custom" : "7d");
  const p = PRESETS.find((x) => x.key === preset);
  const from = p ? p.from() : params.get("from") ?? daysAgo(6);
  const to = p ? ("to" in p ? p.to() : today()) : params.get("to") ?? today();
  const state = {
    preset,
    from,
    to,
    verb: (params.get("verb") ?? "").split(",").filter(Boolean) as AuditVerb[],
    action: (params.get("action") ?? "").split(",").filter(Boolean),
    entity: (params.get("entity") ?? "").split(",").filter(Boolean),
    user: params.get("user") ? Number(params.get("user")) : null,
    userName: params.get("user_name") ?? "",
    q: params.get("q") ?? "",
    view: (params.get("view") === "log" ? "log" : "insights") as "insights" | "log",
    page: Math.max(1, Number(params.get("page")) || 1),
    size: [25, 50, 100].includes(Number(params.get("size"))) ? Number(params.get("size")) : 25,
  };
  const update = (patch: Record<string, string | number | string[] | null | undefined>, keepPage = false) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          const s = Array.isArray(v) ? v.join(",") : v === null || v === undefined ? "" : String(v);
          if (s) n.set(k, s);
          else n.delete(k);
        }
        if (!keepPage && !("page" in patch)) n.delete("page");
        return n;
      },
      { replace: true },
    );
  const filterQs = new URLSearchParams({ from, to });
  if (state.verb.length) filterQs.set("verb", state.verb.join(","));
  if (state.action.length) filterQs.set("action", state.action.join(","));
  if (state.entity.length) filterQs.set("entity", state.entity.join(","));
  if (state.user) filterQs.set("user_id", String(state.user));
  if (state.q) filterQs.set("q", state.q);
  return { state, update, qs: filterQs.toString() };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AuditLog() {
  const { state, update, qs } = useAuditQuery();
  const summary = useReport(() => auditApi.summary(qs), `s|${qs}`);
  const s = summary.data;
  const activeFilters = state.verb.length + state.action.length + state.entity.length + (state.user ? 1 : 0) + (state.q ? 1 : 0);

  return (
    <AnalyticsShell
      title="Audit log"
      subtitle="What people changed in the MIS: records created, edited and deleted, things published, access and permission changes, sign-ins."
      refreshing={summary.loading && !!s}
      actions={
        <button className={btnGhost} onClick={() => auditApi.csv(qs, `audit-log-${state.from}-to-${state.to}.csv`)}>
          <Download className="w-4 h-4" aria-hidden /> Export CSV
        </button>
      }
    >
      <Filters state={state} update={update} facets={s?.facets} activeFilters={activeFilters} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="View"
          value={state.view}
          onChange={(v) => update({ view: v === "insights" ? null : v })}
          options={[
            { value: "insights", label: "Insights" },
            { value: "log", label: `Log entries${s ? ` (${fmtInt(s.total)})` : ""}` },
          ]}
        />
        {s && (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {fmtInt(s.total)} {s.total === 1 ? "entry" : "entries"} by {fmtInt(s.people)} {s.people === 1 ? "person" : "people"} · {state.from === state.to ? state.from : `${state.from} → ${state.to}`}
          </p>
        )}
      </div>

      {summary.error && <Empty>{summary.error}</Empty>}
      {state.view === "insights" ? <Insights summary={summary} update={update} state={state} /> : <LogTable qs={qs} state={state} update={update} />}
    </AnalyticsShell>
  );
}

type Q = ReturnType<typeof useAuditQuery>;

// ---------------------------------------------------------------------------
// Filter bar: one row above everything it affects
// ---------------------------------------------------------------------------
const Filters: React.FC<{ state: Q["state"]; update: Q["update"]; facets?: { actions: { value: string; verb: AuditVerb; count: number }[]; entities: { value: string; count: number }[] }; activeFilters: number }> = ({
  state,
  update,
  facets,
  activeFilters,
}) => {
  const [text, setText] = useState(state.q);
  useEffect(() => setText(state.q), [state.q]);
  useEffect(() => {
    if (text === state.q) return;
    const t = window.setTimeout(() => update({ q: text.trim() || null }), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const toggleVerb = (v: AuditVerb) => update({ verb: state.verb.includes(v) ? state.verb.filter((x) => x !== v) : [...state.verb, v] });

  return (
    <div className="rounded-2xl border border-white/60 dark:border-slate-700/30 bg-white/70 dark:bg-slate-800/50 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="w-4 h-4 text-slate-600 dark:text-slate-300" aria-hidden />
        <SearchSelect
          label="Date range"
          width={170}
          value={state.preset}
          onChange={(v) => v && v !== "custom" && update({ preset: v === "7d" ? null : v, from: null, to: null })}
          options={[...PRESETS.map((p) => ({ value: p.key, label: p.label })), { value: "custom", label: "Custom…", description: "Pick the dates on the right" }]}
        />
        <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          From
          <input type="date" className={`${inputCls} !w-auto !py-1.5 !rounded-[10px]`} value={state.from} max={state.to} onChange={(e) => e.target.value && update({ preset: "custom", from: e.target.value, to: state.to })} />
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          to
          <input type="date" className={`${inputCls} !w-auto !py-1.5 !rounded-[10px]`} value={state.to} min={state.from} max={today()} onChange={(e) => e.target.value && update({ preset: "custom", from: state.from, to: e.target.value })} />
        </label>
        <label className="relative flex-1 min-w-[200px] max-w-sm ml-auto">
          <span className="sr-only">Search descriptions, actions and people</span>
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" aria-hidden />
          <input className={`${inputCls} !pl-8 !py-1.5 !rounded-[10px]`} placeholder="Search description, action, person, record #…" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Kind of action" className="flex flex-wrap gap-1.5">
          {VERB_ORDER.map((v) => {
            const m = VERB_META[v];
            const on = state.verb.includes(v);
            return (
              <button
                key={v}
                onClick={() => toggleVerb(v)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all ${
                  on
                    ? "border-brand-600 bg-brand-50 dark:bg-slate-700 text-text-primary-light dark:text-text-primary-dark shadow-sm"
                    : "border-border-light dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-surface-light dark:hover:bg-slate-800"
                }`}
              >
                <m.icon className="w-3.5 h-3.5" aria-hidden />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchSelect
          multi
          label="Actions"
          width={300}
          isLoading={!facets}
          placeholder="All actions"
          value={state.action}
          onChange={(v) => update({ action: v })}
          options={(facets?.actions ?? []).map((a) => ({ value: a.value, label: humanAction(a.value), description: `${fmtInt(a.count)} in range`, group: VERB_META[a.verb]?.label ?? "Other" }))}
        />
        <SearchSelect
          multi
          label="Record types"
          width={240}
          isLoading={!facets}
          placeholder="All record types"
          value={state.entity}
          onChange={(v) => update({ entity: v })}
          options={(facets?.entities ?? []).map((e) => ({ value: e.value, label: humanEntity(e.value), description: `${fmtInt(e.count)} in range` }))}
        />
        {state.user && (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-brand-600 bg-brand-50 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-text-primary-light dark:text-text-primary-dark">
            <UserRound className="w-3.5 h-3.5" aria-hidden />
            {state.userName || `User ${state.user}`}
            <button aria-label="Remove person filter" className="rounded hover:text-rose-700 dark:hover:text-rose-300" onClick={() => update({ user: null, user_name: null })}>
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
        {activeFilters > 0 && (
          <button className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:underline" onClick={() => update({ verb: null, action: null, entity: null, user: null, user_name: null, q: null })}>
            <X className="w-3.5 h-3.5" aria-hidden /> Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------
const Insights: React.FC<{ summary: ReturnType<typeof useReport<any>>; update: Q["update"]; state: Q["state"] }> = ({ summary, update, state }) => {
  const s = summary.data as import("../../api/systems").AuditSummary | null;
  const { theme } = useTheme();
  const dark = theme === "dark";
  const { can } = useAccess();
  const canOpenPeople = can("ANALYTICS_USER_VIEW");
  const verbCount = (v: AuditVerb) => s?.verbs.find((x) => x.verb === v)?.count ?? 0;

  if (!s && summary.loading)
    return (
      <>
        <SkeletonKpis count={5} className="grid grid-cols-2 lg:grid-cols-5 gap-3" />
        <div className="grid lg:grid-cols-3 gap-4">
          <SkeletonPanel className="lg:col-span-2" />
          <SkeletonPanel><SkeletonDonut size={140} /></SkeletonPanel>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <SkeletonPanel key={i}><SkeletonList rows={6} /></SkeletonPanel>)}
        </div>
      </>
    );
  if (!s) return null;
  if (s.total === 0)
    return (
      <Panel>
        <Empty>No audit entries match these filters. Try a wider date range or clear a filter.</Empty>
      </Panel>
    );
  const spark = s.series.map((p) => p.count);
  const gran = s.gran;
  const filterAction = (a: string) => update({ action: state.action.includes(a) ? state.action : [...state.action, a] });

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Entries" icon={<FileText className="w-3.5 h-3.5" />} value={fmtInt(s.total)} spark={<Sparkline values={spark} />} />
        <Kpi label="People acting" icon={<Users className="w-3.5 h-3.5" />} value={fmtInt(s.people)} hint={s.users[0] ? `most active: ${s.users[0].name}` : undefined} />
        <Kpi label="Deletions" icon={<Trash2 className="w-3.5 h-3.5" />} value={fmtInt(verbCount("DELETE"))} hint={s.total ? `${Math.round((verbCount("DELETE") / s.total) * 100)}% of entries` : undefined} />
        <Kpi label="Access & security" icon={<ShieldAlert className="w-3.5 h-3.5" />} value={fmtInt(verbCount("SECURITY"))} hint="roles, permissions, passwords" />
        <Kpi label={gran === "hour" ? "Busiest hour" : "Busiest day"} icon={<CalendarRange className="w-3.5 h-3.5" />} value={<span className="text-base">{s.busiest ? bucketText(s.busiest.bucket, gran) : "—"}</span>} hint={s.busiest ? `${fmtInt(s.busiest.count)} entries` : undefined} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <ChartPanel
          className="lg:col-span-2"
          loading={summary.loading}
          title={`Entries per ${gran}`}
          table={
            <DataTable
              dense
              rows={s.series.filter((p) => p.count > 0)}
              rowKey={(r) => r.bucket}
              empty="No entries."
              columns={[
                { key: "b", label: gran === "hour" ? "Hour" : "Day", render: (r) => bucketText(r.bucket, gran) },
                { key: "c", label: "Entries", align: "right", sortValue: (r) => r.count, render: (r) => fmtInt(r.count) },
              ]}
            />
          }
        >
          <TrendLines ariaLabel="Audit entries over time" data={s.series} x="bucket" xLabel={(v) => bucketText(v, gran)} series={[{ key: "count", label: "Entries" }]} brush={s.series.length > 48} />
        </ChartPanel>
        <Panel title="By kind" className="min-w-0 an-rise">
          <Donut
            size={140}
            ariaLabel="Entries by kind of action"
            centerLabel="Entries"
            data={s.verbs.map((v) => ({ key: v.verb, label: VERB_META[v.verb]?.label ?? v.verb, value: v.count, color: dark ? VERB_META[v.verb]?.dark : VERB_META[v.verb]?.light }))}
          />
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2">Use the kind buttons above to narrow everything on this page.</p>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Top actions" className="min-w-0 an-rise">
          <BarList
            ariaLabel="Top actions"
            onSelect={filterAction}
            rows={s.actions.map((a) => ({
              key: a.action,
              label: (
                <span className="inline-flex items-center gap-2 min-w-0">
                  <VerbBadge verb={a.verb} compact />
                  <span className="truncate">{humanAction(a.action)}</span>
                </span>
              ),
              value: a.count,
              color: dark ? VERB_META[a.verb]?.dark : VERB_META[a.verb]?.light,
            }))}
          />
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2">Select an action to filter by it.</p>
        </Panel>
        <Panel title="Most active people" className="min-w-0 an-rise">
          <ul className="space-y-1" aria-label="Most active people">
            {s.users.map((u) => {
              const top = s.users[0]?.count || 1;
              return (
                <li key={u.user_id}>
                  <button
                    className="group w-full text-left rounded-lg px-1.5 py-1.5 -mx-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    onClick={() => update({ user: u.user_id, user_name: u.name })}
                    title="Show only this person's entries"
                  >
                    <span className="flex items-center gap-2.5">
                      <UserAvatar decorative userId={u.user_id} name={u.name} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2 text-sm">
                          <span className="truncate font-medium text-text-primary-light dark:text-text-primary-dark">{u.name}</span>
                          <span className="tabular-nums text-slate-700 dark:text-slate-200">{fmtInt(u.count)}</span>
                        </span>
                        <span className="block h-1 rounded-full bg-slate-100 dark:bg-slate-800 mt-1 overflow-hidden" aria-hidden>
                          <span className="block h-full rounded-full bg-brand-600 dark:bg-sky-400 an-grow" style={{ width: `${(u.count / top) * 100}%` }} />
                        </span>
                        <span className="block text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">last {fmtAt(u.last_at)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {canOpenPeople && s.users[0] && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2">
              Open a person's full activity from <Link className="underline" to={`/analytics/users/${s.users[0].user_id}`}>Usage &amp; Monitoring</Link>.
            </p>
          )}
        </Panel>
        <Panel title="Record types" className="min-w-0 an-rise">
          <BarList
            ariaLabel="Record types"
            onSelect={(k) => k !== "__none" && update({ entity: state.entity.includes(k) ? state.entity : [...state.entity, k] })}
            rows={s.entities.map((e) => ({ key: e.entity ?? "__none", label: e.entity ? humanEntity(e.entity) : "No record (e.g. sign-ins)", value: e.count }))}
          />
        </Panel>
      </div>

      <Panel title="When changes happen" className="an-rise">
        <Heatmap grid={s.heatmap} metric="entries" />
      </Panel>
    </>
  );
};

// ---------------------------------------------------------------------------
// Log entries
// ---------------------------------------------------------------------------
const LogTable: React.FC<{ qs: string; state: Q["state"]; update: Q["update"] }> = ({ qs, state, update }) => {
  const listQs = `${qs}&limit=${state.size}&offset=${(state.page - 1) * state.size}`;
  const { data, loading, error } = useReport(() => auditApi.list(listQs), listQs);
  const { can } = useAccess();
  const canOpenPeople = can("ANALYTICS_USER_VIEW");
  const [open, setOpen] = useState<AuditRow | null>(null);
  const rows = useMemo(() => data?.logs ?? [], [data]);

  return (
    <Panel
      className="an-rise"
      title={`Log entries${data ? ` (${fmtInt(data.pagination.total)})` : ""}`}
      actions={
        <SearchSelect
          label="Rows per page"
          width={150}
          value={String(state.size)}
          onChange={(v) => v && update({ size: v === "25" ? null : v })}
          options={[25, 50, 100].map((n) => ({ value: String(n), label: `${n} per page` }))}
        />
      }
    >
      {error ? (
        <Empty>{error}</Empty>
      ) : (
        <DataTable
          rows={rows}
          loading={loading}
          rowKey={(r) => String(r.activity_id)}
          empty="No audit entries match these filters."
          columns={[
            { key: "t", label: "When", className: "whitespace-nowrap", render: (r) => <span className="tabular-nums">{fmtAt(r.created_at)}</span> },
            { key: "k", label: "Kind", render: (r) => <VerbBadge verb={r.verb} /> },
            {
              key: "a",
              label: "What happened",
              render: (r) => (
                <span className="block min-w-[220px] max-w-xl">
                  <span className="block font-medium text-text-primary-light dark:text-text-primary-dark">{humanAction(r.action_type)}</span>
                  <span className="block text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{r.description}</span>
                </span>
              ),
            },
            {
              key: "u",
              label: "Who",
              render: (r) => {
                const name = r.user_name ?? `User ${r.user_id}`;
                return (
                  <span className="flex items-center gap-2 min-w-[150px]">
                    <UserAvatar decorative userId={r.user_id} name={name} size={28} />
                    <span className="min-w-0">
                      <button className="block text-left font-medium hover:underline text-text-primary-light dark:text-text-primary-dark" onClick={() => update({ user: r.user_id, user_name: name })} title="Show only this person's entries">
                        {name}
                      </button>
                      {r.actor_id && r.actor_id !== r.user_id && <span className="block text-[11px] text-slate-600 dark:text-slate-300">by {r.actor_name ?? `User ${r.actor_id}`}</span>}
                      {canOpenPeople && <Link to={`/analytics/users/${r.user_id}`} className="text-[11px] text-brand-600 dark:text-sky-300 hover:underline">Activity →</Link>}
                    </span>
                  </span>
                );
              },
            },
            {
              key: "e",
              label: "Record",
              render: (r) =>
                r.entity_type ? (
                  <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {humanEntity(r.entity_type)}
                    {r.entity_id ? <span className="ml-1 font-mono text-slate-600 dark:text-slate-300">#{r.entity_id}</span> : null}
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">—</span>
                ),
            },
            {
              key: "d",
              label: <span className="sr-only">Details</span>,
              render: (r) => (
                <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setOpen(r)} aria-label={`Details of ${humanAction(r.action_type)} at ${fmtAt(r.created_at)}`}>
                  <Eye className="w-3.5 h-3.5" aria-hidden /> Details
                </button>
              ),
            },
          ]}
        />
      )}
      {data && <Pager page={state.page} total={data.pagination.total} limit={state.size} onPage={(p) => update({ page: p === 1 ? null : p }, true)} />}
      <EntryDialog row={open} onClose={() => setOpen(null)} />
    </Panel>
  );
};

const EntryDialog: React.FC<{ row: AuditRow | null; onClose: () => void }> = ({ row, onClose }) => {
  const pretty = useMemo(() => {
    if (!row?.metadata) return null;
    try {
      return JSON.stringify(JSON.parse(row.metadata), null, 2);
    } catch {
      return row.metadata;
    }
  }, [row]);
  if (!row) return null;
  const fields: [string, React.ReactNode][] = [
    ["When", fmtAt(row.created_at)],
    ["Kind", <VerbBadge key="k" verb={row.verb} />],
    ["Action", <span key="a" className="font-mono text-xs">{row.action_type}</span>],
    ["Person", `${row.user_name ?? `User ${row.user_id}`}${row.user_username ? ` (@${row.user_username})` : ""}`],
    ...(row.actor_id && row.actor_id !== row.user_id ? ([["Done by", `${row.actor_name ?? `User ${row.actor_id}`}${row.actor_username ? ` (@${row.actor_username})` : ""}`]] as [string, React.ReactNode][]) : []),
    ["Record", row.entity_type ? `${humanEntity(row.entity_type)}${row.entity_id ? ` #${row.entity_id}` : ""}` : "—"],
    ["Entry #", <span key="i" className="font-mono text-xs">{row.activity_id}</span>],
  ];
  return (
    <Modal isOpen onClose={onClose} title={humanAction(row.action_type)} size="lg">
      <div className="p-6 space-y-4">
        <p className="text-sm">{row.description}</p>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          {fields.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-slate-600 dark:text-slate-300">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
        <div>
          <h3 className="text-xs font-semibold mb-1.5">Details recorded</h3>
          {pretty ? (
            <pre className="max-h-80 overflow-auto rounded-xl bg-slate-50 dark:bg-slate-900 border border-border-light dark:border-slate-700 p-3 text-xs text-slate-800 dark:text-slate-200" tabIndex={0}>
              {pretty}
            </pre>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">No extra details were recorded for this entry.</p>
          )}
        </div>
      </div>
    </Modal>
  );
};
