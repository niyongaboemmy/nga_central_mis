import React, { useEffect, useState } from "react";
import { Monitor, Smartphone, Tablet, Bot, HelpCircle } from "lucide-react";
import api from "../../services/api";
import { useTheme } from "../../contexts/ThemeContext";
import type { AppKey, GeoView, PresenceStatus } from "../../api/monitor";
import misCatalog from "../../activity/mis.catalog.json";

/**
 * Shared pieces for the Usage & Monitoring console.
 *
 * App colours are categorical slots 1-4 of the dataviz reference palette, in a fixed
 * order and identical on every page: an app keeps its colour whatever the filter.
 * Light and dark steps are each validated against their own surface.
 */
export const APPS: AppKey[] = ["mis", "tm", "tendo", "tupo"];
export const APP_META: Record<AppKey, { label: string; light: string; dark: string }> = {
  mis: { label: "NGA MIS", light: "#2a78d6", dark: "#3987e5" },
  tm: { label: "Task Mentor", light: "#eb6834", dark: "#d95926" },
  tendo: { label: "Tendo", light: "#1baf7a", dark: "#199e70" },
  tupo: { label: "Tupo", light: "#eda100", dark: "#c98500" },
};

export const useAppColors = () => {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (app: AppKey) => (dark ? APP_META[app].dark : APP_META[app].light);
};

export const AppDot: React.FC<{ app: AppKey; withLabel?: boolean }> = ({ app, withLabel = true }) => {
  const color = useAppColors()(app);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {withLabel && <span>{APP_META[app]?.label ?? app}</span>}
    </span>
  );
};

/** Status is shown with a shape + word, never colour alone. */
const STATUS: Record<PresenceStatus, { label: string; cls: string; ring: string }> = {
  active: { label: "Active", cls: "bg-emerald-500", ring: "" },
  idle: { label: "Idle", cls: "bg-amber-500", ring: "" },
  background: { label: "In background", cls: "bg-transparent", ring: "ring-2 ring-inset ring-slate-400" },
  offline: { label: "Offline", cls: "bg-slate-300 dark:bg-slate-600", ring: "" },
};
export const StatusBadge: React.FC<{ status: PresenceStatus; compact?: boolean }> = ({ status, compact }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
    <span aria-hidden className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS[status].cls} ${STATUS[status].ring}`} />
    {!compact && STATUS[status].label}
    {compact && <span className="sr-only">{STATUS[status].label}</span>}
  </span>
);

export const DeviceIcon: React.FC<{ type?: string | null; className?: string }> = ({ type, className = "w-4 h-4" }) => {
  const Icon = type === "mobile" ? Smartphone : type === "tablet" ? Tablet : type === "bot" ? Bot : type === "desktop" ? Monitor : HelpCircle;
  return <Icon className={className} aria-label={type ?? "unknown device"} />;
};

const CONN: Record<string, string> = { mobile: "mobile", fixed: "fixed line", hosting: "data centre", education: "education network", private: "private network" };

/** "≈ Huye, RW · MTN RWANDACELL (mobile)". City is approximate, and the UI says so. */
export const placeLabel = (geo: GeoView | null | undefined, network?: string | null) => {
  if (!geo) return network ? `${network}` : "Unknown location";
  if (geo.conn_type === "private") return network ? `Private network · ${network}` : "Private network";
  const where = [geo.city, geo.country_code].filter(Boolean).join(", ");
  const isp = geo.isp ? `${geo.isp}${CONN[geo.conn_type] ? ` (${CONN[geo.conn_type]})` : ""}` : CONN[geo.conn_type] ?? "";
  const parts = [where ? `≈ ${where}` : null, isp || null, network ? `· ${network}` : null].filter(Boolean);
  return parts.join(" · ").replace(" · ·", " ·") || "Unknown location";
};

export const timeAgo = (iso: string | number, now = Date.now()) => {
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d`;
};

export const userTypeLabel = (t: string | null | undefined) =>
  t ? t.charAt(0) + t.slice(1).toLowerCase() : "Unknown";

// ---------------------------------------------------------------------------
// Feature labels: the MIS catalog ships with the app; the others come from the server.
// ---------------------------------------------------------------------------
type Labels = Record<string, { label: string; module: string | null }>;
const local: Labels = Object.fromEntries(
  (misCatalog as any).features.map((f: any) => [f.key, { label: f.label, module: f.module ?? null }]),
);
let remote: Labels | null = null;
let remoteLoading: Promise<void> | null = null;

export const useFeatureLabels = () => {
  const [labels, setLabels] = useState<Labels>(() => ({ ...local, ...(remote ?? {}) }));
  useEffect(() => {
    if (remote) return;
    remoteLoading ??= api
      .get("/monitor/catalog")
      .then((r) => {
        remote = Object.fromEntries((r.data.data as any[]).map((f) => [f.feature_key, { label: f.label, module: f.module }]));
      })
      .catch(() => {
        remote = {};
      });
    void remoteLoading.then(() => setLabels({ ...local, ...(remote ?? {}) }));
  }, []);
  return (key: string | null | undefined, route?: string | null) => {
    if (!key) return route ?? "—";
    if (labels[key]) return labels[key].label;
    if (key.endsWith(".other")) return route ? `Other: ${route}` : "Other page";
    return key;
  };
};

// ---------------------------------------------------------------------------
// Layout bits
// ---------------------------------------------------------------------------
export const Kpi: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "muted";
  icon?: React.ReactNode;
  /** Change vs the comparison period, in percent. */
  delta?: React.ReactNode;
  /** Trend under the number (decorative; the tile states the value). */
  spark?: React.ReactNode;
  info?: string;
}> = ({ label, value, hint, icon, delta, spark, info }) => (
  <div className="group rounded-2xl border border-white/60 dark:border-slate-700/30 bg-white/70 dark:bg-slate-800/50 px-4 py-3 min-w-0 an-rise transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft hover:border-slate-200 dark:hover:border-slate-600/50">
    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 min-w-0">
      {icon && <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200" aria-hidden>{icon}</span>}
      <span className="truncate" title={info}>{label}</span>
    </div>
    <div className="mt-1 flex items-baseline gap-2 flex-wrap">
      <span className="text-2xl font-semibold tabular-nums text-text-primary-light dark:text-text-primary-dark">{value}</span>
      {delta}
    </div>
    {hint && <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{hint}</div>}
    {spark}
  </div>
);

export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) => (
  <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl border border-border-light dark:border-slate-700 p-0.5 bg-white/60 dark:bg-slate-900/40">
    {options.map((o) => (
      <button
        key={o.value}
        role="radio"
        aria-checked={value === o.value}
        onClick={() => onChange(o.value)}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
          value === o.value
            ? "bg-brand-600 text-white shadow-sm"
            : "text-text-primary-light dark:text-text-primary-dark hover:bg-surface-light dark:hover:bg-slate-800"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
