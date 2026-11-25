import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronsDown, CircleDot, FileStack, LifeBuoy, Package, Receipt, Rocket, School, ScrollText, Settings2, UserCog, Wallet, type LucideIcon } from "lucide-react";
import SelectField from "../../ui/SelectField";
import { EmptyState } from "../kit";
import { platformApi, type AuditEntry, type TenantListItem } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { IconTile, type Tone } from "../viz";
import { Btn, Skeleton, cx, errorText, inputCls, surface } from "./platformShared";

/** Page size the "load more" expects; a shorter page means the end. */
export const AUDIT_PAGE = 50;

/** Action families: one prefix each (the API filters by prefix). Most specific first. */
const FAMILIES: Array<{ key: string; label: string; prefix: string; icon: LucideIcon; tone: Tone }> = [
  { key: "admins", label: "Admins", prefix: "platform.tenant.", icon: UserCog, tone: "blue" },
  { key: "schools", label: "Schools", prefix: "tenant.", icon: School, tone: "blue" },
  { key: "applications", label: "Applications", prefix: "application.", icon: FileStack, tone: "blue" },
  { key: "invoices", label: "Invoices", prefix: "invoice.", icon: Receipt, tone: "blue" },
  { key: "payments", label: "Payments", prefix: "payment.", icon: Wallet, tone: "emerald" },
  { key: "support", label: "Support", prefix: "support.", icon: LifeBuoy, tone: "amber" },
  { key: "setup", label: "Setup", prefix: "provisioning.", icon: Rocket, tone: "blue" },
  { key: "packages", label: "Packages", prefix: "package.", icon: Package, tone: "blue" },
];
const OTHER = { key: "other", label: "Other", prefix: "", icon: Settings2, tone: "gray" as Tone };

const familyOf = (action: string) => FAMILIES.find((f) => action.startsWith(f.prefix)) ?? OTHER;

/** "tenant.extend_grace" -> "Extend grace"; the family chip already says "Schools". */
const verbOf = (action: string) => {
  const f = familyOf(action);
  const rest = (f.prefix ? action.slice(f.prefix.length) : action).replace(/[._]+/g, " ").trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : action;
};

/** A short read-out of the payload: the reason first, then up to three simple fields. */
const detailsOf = (payload: unknown): { reason: string | null; facts: Array<[string, string]> } => {
  if (!payload || typeof payload !== "object") return { reason: null, facts: [] };
  const p = payload as Record<string, unknown>;
  const reason = typeof p.reason === "string" ? p.reason : typeof p.note === "string" ? p.note : null;
  const facts = Object.entries(p)
    .filter(([k, v]) => k !== "reason" && k !== "note" && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
    .slice(0, 3)
    .map(([k, v]) => [k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase(), String(v)] as [string, string]);
  return { reason, facts };
};

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabel = (key: string) => {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const AuditPage: React.FC = () => {
  const [family, setFamily] = useState<string>("all");
  const [tid, setTid] = useState<number | "">("");
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = useMotion();

  useEffect(() => {
    platformApi.tenants().then(setTenants, () => undefined);
  }, []);

  const prefix = FAMILIES.find((f) => f.key === family)?.prefix;
  const fetchPage = useCallback((before?: number) => platformApi.audit({ action: prefix, tid: tid === "" ? undefined : tid, before }), [prefix, tid]);

  useEffect(() => {
    let live = true;
    setRows(null);
    fetchPage().then(
      (r) => {
        if (!live) return;
        setRows(r);
        setMore(r.length >= AUDIT_PAGE);
        setError(null);
      },
      (e) => live && (setError(errorText(e)), setRows([])),
    );
    return () => {
      live = false;
    };
  }, [fetchPage]);

  const nameOf = (id: number | null) => (id === null ? null : tenants.find((t) => t.tid === id)?.name ?? `School #${id}`);
  const shown = rows ?? [];
  const days = useMemo(() => {
    const out: Array<{ key: string; entries: AuditEntry[] }> = [];
    for (const e of shown) {
      const k = dayKey(e.at);
      const last = out[out.length - 1];
      if (last?.key === k) last.entries.push(e);
      else out.push({ key: k, entries: [e] });
    }
    return out;
  }, [shown]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5" role="radiogroup" aria-label="Kind of action">
          {[{ key: "all", label: "All", icon: ScrollText, tone: "blue" as Tone }, ...FAMILIES].map((f) => {
            const on = family === f.key;
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFamily(f.key)}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  on ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:bg-gray-800",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="w-full sm:ml-auto sm:w-64">
        <SelectField aria-label="School" searchable value={tid} onChange={(e) => setTid(e.target.value ? Number(e.target.value) : "")} className={inputCls}>
          <option value="">All schools</option>
          {tenants.map((t) => (
            <option key={t.tid} value={t.tid}>
              {t.name}
            </option>
          ))}
        </SelectField>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className={cx(surface.card, "p-4 sm:p-5")}>
        {!rows ? (
          <ul className="space-y-5" role="status" aria-busy="true" aria-label="Loading audit entries">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 shrink-0 !rounded-xl" />
                <span className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-48 max-w-[60%]" />
                  <Skeleton className="h-3 w-72 max-w-[85%]" />
                </span>
              </li>
            ))}
          </ul>
        ) : days.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nothing recorded" />
        ) : (
          <div className="space-y-6" aria-label="Audit">
            {days.map((d) => (
              <section key={d.key} aria-label={dayLabel(d.key)}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{dayLabel(d.key)}</h3>
                <ol className={cx("relative space-y-4 border-l pl-6", surface.rail)} style={{ marginLeft: "0.95rem" }}>
                  <AnimatePresence initial={false}>
                    {d.entries.map((e) => {
                      const f = familyOf(e.action);
                      const { reason, facts } = detailsOf(e.payload);
                      const school = nameOf(e.targetTid);
                      return (
                        <motion.li key={e.id} layout {...m("reveal")} className="relative">
                          <span className="absolute -left-[2.45rem] top-0 rounded-xl bg-white dark:bg-gray-900">
                            <IconTile icon={f.icon} tone={f.tone} size="sm" />
                          </span>
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{verbOf(e.action)}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{f.label}</span>
                            {school && (
                              <button
                                type="button"
                                onClick={() => setTid(e.targetTid ?? "")}
                                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:bg-gray-800"
                                title="Only this school"
                              >
                                <School className="h-3 w-3" aria-hidden />
                                {school}
                              </button>
                            )}
                            <time className="ml-auto text-xs tabular-nums text-gray-500 dark:text-gray-400" dateTime={e.at}>
                              {timeOf(e.at)}
                            </time>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-gray-700 dark:text-gray-300">{e.actor ?? "System"}</span>
                            <span className="sr-only"> · {e.action}</span>
                          </p>
                          {reason && <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm text-gray-800 dark:bg-gray-800/50 dark:text-gray-100">{reason}</p>}
                          {facts.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {facts.map(([k, v]) => (
                                <span key={k} className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
                                  <CircleDot className="h-2.5 w-2.5 shrink-0 text-gray-400" aria-hidden />
                                  {k}: <span className="truncate font-medium text-gray-800 dark:text-gray-100">{v}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ol>
              </section>
            ))}
          </div>
        )}
        {rows && more && (
          <div className="mt-5 flex justify-center">
            <Btn
              icon={ChevronsDown}
              busy={busy}
              onClick={async () => {
                const last = rows[rows.length - 1];
                if (!last) return;
                setBusy(true);
                try {
                  const page = await fetchPage(last.id);
                  setRows([...rows, ...page.filter((p) => !rows.some((r) => r.id === p.id))]);
                  setMore(page.length >= AUDIT_PAGE);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              More
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditPage;
