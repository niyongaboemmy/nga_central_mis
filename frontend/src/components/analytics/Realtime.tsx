import React, { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronRight, Radio, Search, Table2, BarChart3, LogIn, LogOut, ShieldAlert, AppWindow, Star, UserX } from "lucide-react";
import { useLiveStream } from "../../hooks/useLiveStream";
import { useAccess } from "../../hooks/useAccess";
import { useTheme } from "../../contexts/ThemeContext";
import type { AppKey, LiveEvent, LiveFilter, LivePerson } from "../../api/monitor";
import { Empty, Panel, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { SearchSelect } from "../ui/SearchSelect";
import { BarList, Donut, Legend } from "./charts";
import { SkeletonChart, SkeletonDonut, SkeletonKpis, SkeletonList, SkeletonMap, SkeletonTable, SkeletonTimeline } from "./Skeleton";
import {
  APPS, APP_META, AppDot, DeviceIcon, Kpi, Segmented, StatusBadge, placeLabel, timeAgo, useAppColors, useFeatureLabels, userTypeLabel,
} from "./common";

/**
 * Realtime (plan §8 page 2): who is online now across every app, what they are using
 * and where from. Names, IPs and places need ANALYTICS_LIVE_VIEW; with only
 * ANALYTICS_VIEW the page shows counts.
 */
const MapView = lazy(() => import("./MapView"));
const USER_TYPES = ["STUDENT", "TEACHER", "STAFF", "ADMIN", "PARENT"];

export default function Realtime() {
  const { can } = useAccess();
  const [apps, setApps] = useState<AppKey[]>([]);
  const [aud, setAud] = useState<"both" | "user" | "visitor">("both");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [chartAsTable, setChartAsTable] = useState(false);
  const filter: LiveFilter = useMemo(() => ({ app: apps, aud, type: type ? [type] : [] }), [apps, aud, type]);
  const live = useLiveStream(filter);
  const label = useFeatureLabels();
  const s = live.snapshot;
  const named = s?.named ?? false;
  const canOpenPeople = can("ANALYTICS_USER_VIEW");

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return live.people
      .filter((p) => {
        if (!q) return true;
        const hay = [p.user?.name, p.visitor?.code, ...p.tabs.flatMap((t) => [t.ip, t.geo?.city, t.geo?.isp, label(t.feature, t.route)])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => rank(b) - rank(a) || (a.user?.name ?? a.visitor?.code ?? "").localeCompare(b.user?.name ?? b.visitor?.code ?? ""));
  }, [live.people, search, label]);

  const appColor = useAppColors();
  const toggleApp = (a: AppKey) => setApps((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  return (
    <AnalyticsShell
      title="Realtime"
      subtitle="Who is on the platform right now, in which app and on which page."
      actions={<LiveIndicator mode={live.mode} updatedAt={live.updatedAt} />}
    >
      {/* Filters: one row above everything they affect. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Apps" className="flex flex-wrap gap-1.5">
          {APPS.map((a) => (
            <button
              key={a}
              onClick={() => toggleApp(a)}
              aria-pressed={apps.includes(a)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                apps.includes(a)
                  ? "border-brand-600 bg-brand-50 dark:bg-brand-900/30 text-text-primary-light dark:text-text-primary-dark"
                  : "border-border-light dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-surface-light dark:hover:bg-slate-800"
              }`}
            >
              <AppDot app={a} />
            </button>
          ))}
        </div>
        <Segmented
          label="Audience"
          value={aud}
          onChange={setAud}
          options={[
            { value: "both", label: "Everyone" },
            { value: "user", label: "Signed in" },
            { value: "visitor", label: "Visitors" },
          ]}
        />
        <SearchSelect
          label="User type"
          width={180}
          isDisabled={aud === "visitor"}
          value={type || "all"}
          onChange={(v) => setType(!v || v === "all" ? "" : v)}
          options={[{ value: "all", label: "All user types" }, ...USER_TYPES.map((t) => ({ value: t, label: `${userTypeLabel(t)}s` }))]}
        />
      </div>

      {/* Headline numbers */}
      {!s ? (
        <SkeletonKpis count={6} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" />
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Online now" value={s ? s.counts.online : "—"} hint="active + idle" />
        <Kpi label="Active" value={s ? s.counts.active : "—"} hint="using it now" />
        <Kpi label="Idle" value={s ? s.counts.idle : "—"} hint="open, no input 2 min" />
        <Kpi label="In background" value={s ? s.counts.background : "—"} hint="tab hidden < 10 min" />
        <Kpi label="Visitors online" value={s ? s.counts.visitors : "—"} hint="not signed in" />
        <Kpi label="Last 5 minutes" value={s ? s.last5 : "—"} hint={s ? `${s.last30} in 30 min` : undefined} />
      </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel
          className="lg:col-span-2 min-w-0"
          title="People active per minute, last 30 minutes"
          actions={
            <button className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 hover:underline" onClick={() => setChartAsTable((v) => !v)}>
              {chartAsTable ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
              {chartAsTable ? "Chart" : "Table"}
            </button>
          }
        >
          {s ? chartAsTable ? <MinuteTable minutes={s.minutes} /> : <MinuteChart minutes={s.minutes} apps={apps.length ? apps : APPS} /> : <SkeletonChart height={176} bars={30} />}
        </Panel>
        <Panel title="Open right now" className="min-w-0">
          {!s ? (
            <SkeletonList rows={6} />
          ) : s.top_features.length ? (
            <BarList
              ariaLabel="Pages open right now"
              rows={s.top_features.map((f) => ({
                key: `${f.app}|${f.feature}`,
                label: (
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <AppDot app={f.app} withLabel={false} />
                    <span className="truncate">{label(f.feature)}</span>
                  </span>
                ),
                value: f.people,
                display: `${f.people} ${f.people === 1 ? "person" : "people"}`,
                color: appColor(f.app),
              }))}
            />
          ) : (
            <Empty>Nobody has a page open.</Empty>
          )}
        </Panel>
      </div>

      <Splits snapshot={s} people={named ? live.people : null} />

      {named && <LiveMap people={live.people} />}

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel
          className="lg:col-span-2 min-w-0"
          title={`Who's online${named ? ` (${people.length})` : ""}`}
          actions={
            named && (
              <label className="relative">
                <span className="sr-only">Search people, IPs, places or pages</span>
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
                <input className={`${inputCls} !pl-7 !py-1.5 w-44 sm:w-56`} placeholder="Name, IP, place, page…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
            )
          }
        >
          {!named ? (
            <Empty>Names, places and IP addresses are shown to holders of “See who is online right now”.</Empty>
          ) : people.length === 0 && (live.mode === "connecting" || !s) ? (
            <SkeletonTable rows={5} cols={6} />
          ) : people.length === 0 ? (
            <Empty>Nobody matches these filters right now.</Empty>
          ) : (
            <Roster people={people} label={label} canOpen={canOpenPeople} />
          )}
        </Panel>
        <Panel title="Live events" className="min-w-0">
          {!named ? <Empty>Shown with “See who is online right now”.</Empty> : !s ? <SkeletonTimeline items={5} /> : <EventFeed events={live.events} />}
        </Panel>
      </div>
    </AnalyticsShell>
  );
}

const rank = (p: LivePerson) => ({ active: 3, idle: 2, background: 1, offline: 0 })[p.status];

const LiveIndicator: React.FC<{ mode: string; updatedAt: number }> = ({ mode, updatedAt }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300" aria-live="polite" data-live-mode={mode}>
    <Radio className={`w-3.5 h-3.5 ${mode === "live" ? "text-emerald-600 animate-pulse" : ""}`} aria-hidden />
    {mode === "live" ? "Live" : mode === "polling" ? "Refreshing every 10 s" : mode === "error" ? "Reconnecting…" : "Connecting…"}
    {updatedAt > 0 && <span className="tabular-nums">· {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
  </span>
);

// ---------------------------------------------------------------------------
// Per-minute stacked bars (≤4 series: categorical slots 1-4, legend + table view)
// ---------------------------------------------------------------------------
const MinuteChart: React.FC<{ minutes: { minute: string; by_app: Record<string, number>; total: number }[]; apps: AppKey[] }> = ({ minutes, apps }) => {
  const color = useAppColors();
  const { theme } = useTheme();
  const surface = theme === "dark" ? "#1e293b" : "#ffffff";
  const data = minutes.map((m) => ({ t: new Date(m.minute).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), total: m.total, ...m.by_app }));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const shown = apps.filter((a) => !hidden.has(a));
  const toggle = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else if (apps.filter((a) => !n.has(a)).length > 1) n.add(k);
      return n;
    });
  return (
    <div>
      <Legend items={apps.map((a) => ({ key: a, label: APP_META[a].label, color: color(a) }))} hidden={hidden} onToggle={toggle} onHover={setHover} />
      <div className="h-44" role="img" aria-label="People active per minute in the last 30 minutes, stacked by app">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={theme === "dark" ? "#334155" : "#e2e8f0"} strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 11, fill: theme === "dark" ? "#cbd5e1" : "#475569" }} interval={4} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: theme === "dark" ? "#cbd5e1" : "#475569" }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: theme === "dark" ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.05)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-xl border border-border-light dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
                    <div className="font-medium mb-1">{label}</div>
                    {shown.map((a) => (
                      <div key={a} className="flex justify-between gap-4">
                        <AppDot app={a} />
                        <span className="tabular-nums">{(payload[0].payload as any)[a] ?? 0}</span>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 border-t border-border-light dark:border-slate-700 mt-1 pt-1">
                      <span>People</span>
                      <span className="tabular-nums">{(payload[0].payload as any).total}</span>
                    </div>
                  </div>
                ) : null
              }
            />
            {shown.map((a, i) => (
              <Bar key={a} dataKey={a} stackId="apps" fill={color(a)} fillOpacity={hover && hover !== a ? 0.3 : 1} stroke={surface} strokeWidth={1} radius={i === shown.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">A person using two apps in the same minute counts once in the total, once in each app.</p>
    </div>
  );
};

const MinuteTable: React.FC<{ minutes: { minute: string; by_app: Record<string, number>; total: number; users: number; visitors: number }[] }> = ({ minutes }) => (
  <div className="max-h-56 overflow-auto">
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-white dark:bg-slate-900">
        <tr className="text-left text-slate-600 dark:text-slate-300">
          <th className="py-1 pr-2 font-medium">Minute</th>
          {APPS.map((a) => (
            <th key={a} className="py-1 pr-2 font-medium text-right">{APP_META[a].label}</th>
          ))}
          <th className="py-1 pr-2 font-medium text-right">Signed in</th>
          <th className="py-1 pr-2 font-medium text-right">Visitors</th>
          <th className="py-1 font-medium text-right">People</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {[...minutes].reverse().map((m) => (
          <tr key={m.minute} className="border-t border-border-light/60 dark:border-slate-800">
            <td className="py-1 pr-2">{new Date(m.minute).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
            {APPS.map((a) => (
              <td key={a} className="py-1 pr-2 text-right">{m.by_app[a] ?? 0}</td>
            ))}
            <td className="py-1 pr-2 text-right">{m.users}</td>
            <td className="py-1 pr-2 text-right">{m.visitors}</td>
            <td className="py-1 text-right font-medium">{m.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------
const Roster: React.FC<{ people: LivePerson[]; label: (k: string | null, r?: string | null) => string; canOpen: boolean }> = ({ people, label, canOpen }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const now = Date.now();
  return (
    <div className="relative overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="text-left text-xs text-slate-600 dark:text-slate-300 border-b border-border-light dark:border-slate-700">
            <th className="py-2 pr-3 font-medium">Person</th>
            <th className="py-2 pr-3 font-medium">Using</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Device</th>
            <th className="py-2 pr-3 font-medium">Network &amp; place</th>
            <th className="py-2 font-medium text-right">Online for</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const main = p.tabs[0];
            const more = p.tabs.length - 1;
            const isOpen = !!open[p.key];
            const href = p.user ? `/analytics/users/${p.user.id}` : p.visitor ? `/analytics/visitors/${p.visitor.device_id}` : null;
            const who = p.user ? (
              <>
                <span className="font-medium">{p.user.name}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-300">{userTypeLabel(p.user.type)}</span>
              </>
            ) : (
              <>
                <span className="font-medium">Visitor {p.visitor?.code}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-300">Not signed in</span>
              </>
            );
            return (
              <React.Fragment key={p.key}>
                <tr className="border-b border-border-light/60 dark:border-slate-800 align-top transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-2 pr-3">
                    <div className="flex items-start gap-1.5">
                      {more > 0 ? (
                        <button
                          className="mt-0.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${p.tabs.length} open tabs`}
                          onClick={() => setOpen((o) => ({ ...o, [p.key]: !isOpen }))}
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      ) : (
                        <span className="w-4" />
                      )}
                      <Avatar name={p.user?.name ?? null} status={p.status} />
                      <div className="min-w-0">{href && canOpen ? <Link to={href} className="hover:underline">{who}</Link> : who}</div>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    {main && (
                      <div className="min-w-0">
                        <AppDot app={main.app} />
                        <div className="text-xs text-slate-700 dark:text-slate-200 truncate max-w-[260px]" title={main.route ?? undefined}>
                          {label(main.feature, main.route)}
                        </div>
                        {more > 0 && !isOpen && <div className="text-[11px] text-slate-600 dark:text-slate-300">+{more} more tab{more > 1 ? "s" : ""}</div>}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3"><StatusBadge status={p.status} /></td>
                  <td className="py-2 pr-3">
                    {main && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                        <DeviceIcon type={main.device.type} />
                        {[main.device.browser, main.device.os].filter(Boolean).join(" · ") || "Unknown"}
                        {main.standalone && <span className="px-1.5 rounded bg-slate-100 dark:bg-slate-800">App</span>}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {main && (
                      <div className="text-xs min-w-0">
                        <div className="font-mono text-slate-800 dark:text-slate-100">{main.ip ?? "—"}</div>
                        <div className="text-slate-600 dark:text-slate-300 truncate max-w-[240px]">{placeLabel(main.geo, main.network)}</div>
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right text-xs tabular-nums text-slate-700 dark:text-slate-200">{timeAgo(p.since, now)}</td>
                </tr>
                {isOpen &&
                  p.tabs.slice(1).map((t, i) => (
                    <tr key={`${p.key}-${i}`} className="bg-surface-light/50 dark:bg-slate-900/40 text-xs">
                      <td />
                      <td className="py-1.5 pr-3">
                        <AppDot app={t.app} /> · {label(t.feature, t.route)}
                      </td>
                      <td className="py-1.5 pr-3"><StatusBadge status={t.status} /></td>
                      <td className="py-1.5 pr-3">{[t.device.browser, t.device.os].filter(Boolean).join(" · ")}</td>
                      <td className="py-1.5 pr-3 font-mono">{t.ip}</td>
                      <td className="py-1.5 text-right tabular-nums">{timeAgo(t.since, now)}</td>
                    </tr>
                  ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Live events
// ---------------------------------------------------------------------------
const EVENT_TEXT: Record<string, { icon: React.ElementType; text: (e: LiveEvent) => string; tone?: string }> = {
  login_success: { icon: LogIn, text: () => "signed in" },
  login_failed: { icon: ShieldAlert, text: (e) => `failed sign-in${e.detail?.username_attempted ? ` as “${e.detail.username_attempted}”` : ""}${e.detail?.reason ? ` (${String(e.detail.reason).replace(/_/g, " ")})` : ""}`, tone: "text-rose-700 dark:text-rose-300" },
  app_launch: { icon: AppWindow, text: (e) => `opened ${APP_META[(e.detail?.target_app as AppKey) ?? "mis"]?.label ?? e.detail?.method ?? "an app"}` },
  logout: { icon: LogOut, text: (e) => (e.detail?.initiator === "admin" ? "was signed out by an administrator" : "signed out") },
  otp_sent: { icon: LogIn, text: () => "passed the password step" },
  password_reset_requested: { icon: ShieldAlert, text: () => "asked for a password reset" },
  account_suspended: { icon: UserX, text: () => "was suspended" },
};

const EventFeed: React.FC<{ events: LiveEvent[] }> = ({ events }) => {
  if (!events.length) return <Empty>Sign-ins, app launches and key actions appear here as they happen.</Empty>;
  return (
    <ol className="space-y-2 max-h-[420px] overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 rounded" aria-live="polite" aria-label="Live events" tabIndex={0}>
      {events.map((e, i) => {
        const def = EVENT_TEXT[e.kind] ?? { icon: Star, text: () => e.kind.replace(/[._]/g, " ") };
        const Icon = def.icon;
        const who = e.user_name ?? (e.visitor_code ? `Visitor ${e.visitor_code}` : "Someone");
        return (
          <li key={`${e.at}-${i}`} className="flex gap-2 text-sm an-rise">
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${def.tone ?? "text-slate-500"}`} aria-hidden />
            <div className="min-w-0">
              <div className={def.tone}>
                <span className="font-medium">{who}</span> {def.text(e)}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                {e.ip ? ` · ${e.ip}` : ""}
                {e.place ? ` · ≈ ${e.place}` : ""}
                {e.isp ? ` · ${e.isp}` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

/** Where people are connecting from right now: one bubble per place, coloured by app. */
const LiveMap: React.FC<{ people: LivePerson[] }> = ({ people }) => {
  const color = useAppColors();
  const points = useMemo(() => {
    const m = new Map<string, { lat: number; lon: number; label: string; value: number; apps: Map<AppKey, number> }>();
    for (const p of people)
      for (const t of p.tabs) {
        if (!t.geo || t.geo.lat === null || t.geo.lon === null) continue;
        const k = `${t.geo.lat},${t.geo.lon}`;
        const e = m.get(k) ?? { lat: t.geo.lat, lon: t.geo.lon, label: `≈ ${[t.geo.city, t.geo.country_code].filter(Boolean).join(", ")}`, value: 0, apps: new Map() };
        e.value++;
        e.apps.set(t.app, (e.apps.get(t.app) ?? 0) + 1);
        m.set(k, e);
      }
    return [...m.entries()].map(([key, e]) => {
      const top = [...e.apps].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mis";
      return { key, lat: e.lat, lon: e.lon, value: e.value, label: e.label, color: color(top) };
    });
  }, [people, color]);
  if (!points.length) return null;
  return (
    <Panel title="Where people connect from right now" className="min-w-0">
      <Suspense fallback={<SkeletonMap height={280} />}>
        <MapView points={points} height={280} ariaLabel="People online by place" />
      </Suspense>
      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">Bubble size = open tabs; colour = the app most used there. Places come from IP addresses and are approximate.</p>
    </Panel>
  );
};

/** Initials in a circle with the presence status as a dot (shape + word stay in the Status column). */
const Avatar: React.FC<{ name: string | null; status: LivePerson["status"] }> = ({ name, status }) => {
  const initials = name ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : "?";
  const dot = status === "active" ? "bg-emerald-500" : status === "idle" ? "bg-amber-500" : "bg-slate-400";
  return (
    <span aria-hidden className="relative shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-100">
      {initials}
      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-800 ${dot}`} />
    </span>
  );
};

/** Part-to-whole splits of who is online: apps, signed in vs visitors, devices. */
const Splits: React.FC<{ snapshot: ReturnType<typeof useLiveStream>["snapshot"]; people: LivePerson[] | null }> = ({ snapshot, people }) => {
  const color = useAppColors();
  const devices = useMemo(() => {
    if (!people) return null;
    const m = new Map<string, number>();
    for (const p of people) {
      const t = p.tabs[0]?.device.type ?? "unknown";
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m].map(([k, v]) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), value: v }));
  }, [people]);
  if (!snapshot)
    return (
      <div className="grid md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Panel key={i} className="min-w-0"><SkeletonDonut size={120} /></Panel>
        ))}
      </div>
    );
  const c = snapshot.counts;
  const signedIn = c.users;
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Panel title="Online by app" className="min-w-0 an-rise">
        <Donut size={128} ariaLabel="People online by app" centerLabel="Online" data={APPS.map((a) => ({ key: a, label: APP_META[a].label, value: c.by_app[a] ?? 0, color: color(a) }))} />
      </Panel>
      <Panel title="Signed in vs visitors" className="min-w-0 an-rise">
        <Donut size={128} ariaLabel="Signed-in people and visitors online" centerLabel="Online" data={[{ key: "u", label: "Signed in", value: signedIn }, { key: "v", label: "Visitors", value: c.visitors }]} />
      </Panel>
      <Panel title="Devices" className="min-w-0 an-rise">
        {devices ? <Donut size={128} ariaLabel="Devices of people online" centerLabel="People" data={devices} /> : <Empty>Shown with “See who is online right now”.</Empty>}
      </Panel>
    </div>
  );
};
