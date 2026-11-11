/**
 * Shared pieces of the platform console (/platform/*): the caps context that
 * gates every screen, small buttons, the required-reason dialog, a lightbox,
 * a switch and a stepper. Icon-first, short labels (plan §8, review R8).
 */
import React, { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Minus, Plus, type LucideIcon } from "lucide-react";
import Modal from "../../ui/Modal";
import { ToastStore } from "../../../services/api";
import { platformApi, type PlatformOverview } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/** backend/src/services/tenantMgmt/catalog.ts PLATFORM_CAPS */
export const PCAP = {
  view: "PLATFORM_TENANTS_VIEW",
  review: "PLATFORM_APPLICATIONS_REVIEW",
  decide: "PLATFORM_APPLICATIONS_DECIDE",
  invoice: "PLATFORM_BILLING_INVOICE",
  confirm: "PLATFORM_BILLING_CONFIRM",
  waive: "PLATFORM_BILLING_WAIVE",
  lifecycle: "PLATFORM_TENANTS_LIFECYCLE",
  entitlements: "PLATFORM_TENANTS_ENTITLEMENTS",
  packages: "PLATFORM_PACKAGES_MANAGE",
  support: "PLATFORM_SUPPORT_ACCESS",
  audit: "PLATFORM_AUDIT_VIEW",
} as const;
export type PCapName = keyof typeof PCAP;

// ---------------------------------------------------------------------------
// Context: overview (badge counts + caps), loaded once by the shell
// ---------------------------------------------------------------------------

interface PlatformCtx {
  overview: PlatformOverview | null;
  loading: boolean;
  error: string | null;
  can: (...caps: PCapName[]) => boolean;
  reload: () => Promise<void>;
  /** a screen with unsaved edits (the shell asks before switching tabs) */
  dirty: boolean;
  setDirty: (d: boolean) => void;
}

const Ctx = createContext<PlatformCtx>({ overview: null, loading: true, error: null, can: () => false, reload: async () => undefined, dirty: false, setDirty: () => undefined });

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const reload = useCallback(async () => {
    try {
      setOverview(await platformApi.overview());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const can = useCallback((...names: PCapName[]) => !!overview && names.some((n) => overview.caps.includes(PCAP[n])), [overview]);
  return <Ctx.Provider value={{ overview, loading, error, can, reload, dirty, setDirty }}>{children}</Ctx.Provider>;
};

export const usePlatform = () => useContext(Ctx);

// ---------------------------------------------------------------------------
// Feedback + formatting
// ---------------------------------------------------------------------------

export const errorText = (e: unknown): string => {
  const r = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return r || (e as Error)?.message || "Something went wrong";
};

export const toast = (message: string, type: "success" | "error" | "warning" | "info" = "success") => ToastStore.getShowToast()?.(message, type);

/** Run an action with success / error toasts; returns the result or undefined. */
export async function act<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const out = await fn();
    if (ok) toast(ok, "success");
    return out;
  } catch (e) {
    toast(errorText(e), "error");
    return undefined;
  }
}

export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const daysUntil = (iso: string | null | undefined): number | null => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);
export const ago = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BTN_TONES = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500",
  danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500",
  warning: "bg-amber-500 text-white hover:bg-amber-400 focus-visible:ring-amber-500",
  ghost:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
} as const;

export const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; tone?: keyof typeof BTN_TONES; busy?: boolean; size?: "sm" | "md" }
> = ({ icon: Icon, tone = "ghost", busy, size = "md", className, children, disabled, ...rest }) => {
  const m = useMotion();
  return (
    <motion.button
      type="button"
      {...(m("tap") as object)}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        BTN_TONES[tone],
        className,
      )}
      {...(rest as object)}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </motion.button>
  );
};

/** Icon-only button: the label is the sr-only text and the tooltip. */
export const IconBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: "default" | "danger" }> = ({
  icon: Icon,
  label,
  tone = "default",
  className,
  ...rest
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    className={cx(
      "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-40",
      tone === "danger"
        ? "text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
      className,
    )}
    {...rest}
  >
    <Icon className="h-4 w-4" aria-hidden />
  </button>
);

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cx("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900", className)}>{children}</div>
);

export const Spinner: React.FC = () => (
  <div className="flex justify-center py-16" role="status">
    <Loader2 className="h-7 w-7 animate-spin text-brand-500" aria-hidden />
    <span className="sr-only">Loading</span>
  </div>
);

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

export const Field: React.FC<{ label: string; icon?: LucideIcon; children: (id: string) => React.ReactNode; className?: string }> = ({ label, icon: Icon, children, className }) => {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </label>
      {children(id)}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Switch and Stepper
// ---------------------------------------------------------------------------

export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; showLabel?: boolean }> = ({
  checked,
  onChange,
  label,
  disabled,
  showLabel,
}) => {
  const reduced = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
    >
      <span className={cx("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors", checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")}>
        <motion.span
          className="h-5 w-5 rounded-full bg-white shadow"
          animate={{ x: checked ? 20 : 0 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 32 }}
        />
      </span>
      {showLabel && <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>}
    </button>
  );
};

export const Stepper: React.FC<{ value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; unit?: string }> = ({
  value,
  onChange,
  min = 0,
  max = 3650,
  label,
  unit = "d",
}) => (
  <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label={label}>
    <IconBtn icon={Minus} label={`${label}: less`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="h-7 w-7" />
    <input
      type="number"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
      className="w-14 bg-transparent text-center text-sm font-bold tabular-nums text-slate-900 focus:outline-none dark:text-white"
    />
    <span className="pr-1 text-xs text-slate-600 dark:text-slate-300">{unit}</span>
    <IconBtn icon={Plus} label={`${label}: more`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="h-7 w-7" />
  </div>
);

// ---------------------------------------------------------------------------
// ReasonDialog: an action that needs a written reason (required by default)
// ---------------------------------------------------------------------------

export const ReasonDialog: React.FC<{
  open: boolean;
  title: string;
  icon?: LucideIcon;
  confirmText: string;
  tone?: keyof typeof BTN_TONES;
  placeholder?: string;
  optional?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown> | void;
  children?: React.ReactNode;
}> = ({ open, title, icon: Icon, confirmText, tone = "primary", placeholder = "Reason", optional, onClose, onSubmit, children }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  const ok = optional || text.trim().length > 0;
  return (
    <Modal
      isOpen={open}
      onClose={() => !busy && onClose()}
      size="md"
      title={
        <span className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5" aria-hidden />}
          {title}
        </span>
      }
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          try {
            await onSubmit(text.trim());
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-4"
      >
        {children}
        <textarea
          aria-label={placeholder}
          placeholder={placeholder}
          required={!optional}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={inputCls}
        />
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" tone={tone} disabled={!ok} busy={busy}>
            {confirmText}
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Lightbox: image or PDF preview
// ---------------------------------------------------------------------------

export const isPdf = (url: string) => /\.pdf($|\?)/i.test(url) || url.includes("application/pdf");

export const Lightbox: React.FC<{ url: string | null; title: string; onClose: () => void }> = ({ url, title, onClose }) => (
  <Modal isOpen={!!url} onClose={onClose} title={title} size="2xl" contentClassName="p-2">
    {url &&
      (isPdf(url) ? (
        <iframe title={title} src={url} className="h-[75vh] w-full rounded-xl bg-white" />
      ) : (
        <img src={url} alt={title} className="mx-auto max-h-[75vh] rounded-xl object-contain" />
      ))}
  </Modal>
);

/** Badge for counts on tabs and chips. */
export const CountBadge: React.FC<{ n: number; tone?: "red" | "slate"; label?: string }> = ({ n, tone = "red", label }) =>
  n > 0 ? (
    <span
      className={cx(
        "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-5",
        tone === "red" ? "bg-red-500 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
      )}
    >
      {n > 99 ? "99+" : n}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  ) : null;

/** Animated tab bar with a sliding underline (layoutId). */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  id,
  label,
}: {
  tabs: Array<{ value: T; label: string; icon?: LucideIcon; badge?: number }>;
  value: T;
  onChange: (v: T) => void;
  id: string;
  label: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
      {tabs.map((t) => {
        const on = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cx(
              "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              on ? "text-brand-700 dark:text-brand-200" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {t.label}
            {!!t.badge && <CountBadge n={t.badge} />}
            {on && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-600 dark:bg-brand-200"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
