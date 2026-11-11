import React, { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Clock, Eye, LifeBuoy, Loader2, Lock, Pencil, ShieldOff, UserRound } from "lucide-react";
import { tenantApi, type SupportSession } from "../../../api/tenantMgmt";
import { EmptyState, Segmented } from "../kit";
import { useMotion } from "../../../design/motion";
import { useAccess } from "../../../hooks/useAccess";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { CountdownRing, btn, card, cx } from "../shared/paymentBits";

/** School support access, /settings/support (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.9). */

type Mode = "READ" | "WRITE";
const HOUR = 3_600_000;
const timeOf = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const whenOf = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

const useNow = (ms = 30_000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
};

const ModeChip: React.FC<{ mode: Mode }> = ({ mode }) => (
  <span
    className={cx(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
      mode === "WRITE" ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" : "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
    )}
  >
    {mode === "WRITE" ? <Pencil className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}
    {mode === "WRITE" ? "Edit" : "View"}
  </span>
);

const SupportAccessPage: React.FC = () => {
  const access = useAccess();
  const m = useMotion();
  const id = useId();
  const now = useNow();
  const [sessions, setSessions] = useState<SupportSession[] | null>(null);
  const [hours, setHours] = useState(2);
  const [mode, setMode] = useState<Mode>("READ");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<SupportSession | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const allowed = access.can(["SCHOOL_SETTINGS_MANAGE", "SCHOOL_BILLING_MANAGE"]);

  const load = useCallback(() => {
    tenantApi
      .supportSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (access.loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="Loading" />
      </div>
    );
  }
  if (!allowed) return <EmptyState icon={Lock} title="Support access is for the school owner" />;

  const live = (s: SupportSession) => s.active && !s.revokedAt && new Date(s.expiresAt).getTime() > now;
  const active = (sessions ?? []).filter(live);
  const past = (sessions ?? []).filter((s) => !live(s));

  const grant = async () => {
    setBusy(true);
    setError(null);
    try {
      await tenantApi.grantSupport({ hours, mode, reason: reason.trim() || undefined });
      setGranted(true);
      setReason("");
      window.setTimeout(() => setGranted(false), 1800);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not grant access");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      await tenantApi.revokeSupport(revoking.id);
      setRevoking(null);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not revoke");
      setRevoking(null);
    } finally {
      setRevokeBusy(false);
    }
  };

  const until = new Date(now + hours * HOUR);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/settings/subscription" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <ArrowLeft className="h-5 w-5" aria-hidden />
          <span className="sr-only">Back to subscription</span>
        </Link>
        <LifeBuoy className="h-6 w-6 text-brand-600 dark:text-brand-200" aria-hidden />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Support access</h1>
      </header>

      {/* Grant */}
      <motion.section {...m("reveal")} className={cx(card, "space-y-5 p-4")} aria-label="Grant support access">
        <div>
          <label htmlFor={`${id}-hours`} className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden /> Duration
            </span>
            <span className="tabular-nums" data-testid="hours-label">
              {hours} h · until {timeOf(until)}
              {until.toDateString() !== new Date(now).toDateString() && <span className="ml-1 text-xs text-slate-600 dark:text-slate-300">tomorrow</span>}
            </span>
          </label>
          <input
            id={`${id}-hours`}
            type="range"
            min={1}
            max={24}
            step={1}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="w-full accent-brand-600"
            aria-valuetext={`${hours} hours, until ${timeOf(until)}`}
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-600 dark:text-slate-300" aria-hidden>
            <span>1 h</span>
            <span>12 h</span>
            <span>24 h</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Mode>
            label="Access mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "READ", label: "View", icon: Eye },
              { value: "WRITE", label: "Edit", icon: Pencil },
            ]}
          />
          <AnimatePresence>
            {mode === "WRITE" && (
              <motion.span {...m("check")} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300" role="note">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Can change data
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <label htmlFor={`${id}-reason`} className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Reason <span className="text-xs font-medium text-slate-600 dark:text-slate-300">(optional)</span>
          </span>
          <input
            id={`${id}-reason`}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </label>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {error}
          </p>
        )}

        <div className="flex justify-end">
          <motion.button
            type="button"
            {...m("tap")}
            onClick={grant}
            disabled={busy}
            className={cx(mode === "WRITE" ? "!bg-amber-600 hover:!bg-amber-500" : "", btn.primary, granted && "!bg-emerald-600")}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : granted ? <Check className="h-4 w-4" aria-hidden /> : <LifeBuoy className="h-4 w-4" aria-hidden />}
            {granted ? "Granted" : "Grant access"}
          </motion.button>
        </div>
      </motion.section>

      {/* Active */}
      <section aria-label="Active sessions" className="space-y-3">
        <AnimatePresence initial={false}>
          {active.map((s) => {
            const totalH = Math.max(1, Math.round((new Date(s.expiresAt).getTime() - new Date(s.startsAt).getTime()) / HOUR));
            const leftH = Math.max(0, (new Date(s.expiresAt).getTime() - now) / HOUR);
            const shown = leftH >= 1 ? Math.floor(leftH) : Math.ceil(leftH * 60);
            return (
              <motion.article key={s.id} layout {...m("reveal")} className={cx(card, "flex flex-wrap items-center gap-4 p-4")} data-testid={`session-${s.id}`}>
                <CountdownRing
                  left={leftH}
                  total={totalH}
                  label={`${shown} ${leftH >= 1 ? "hours" : "minutes"} left, until ${whenOf(s.expiresAt)}`}
                  center={
                    <>
                      <span className="text-base font-extrabold tabular-nums">{shown}</span>
                      <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{leftH >= 1 ? "h" : "min"}</span>
                    </>
                  }
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ModeChip mode={s.mode} />
                    <span className="text-xs text-slate-600 dark:text-slate-300">→ {whenOf(s.expiresAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
                    <UserRound className="h-4 w-4 text-slate-500 dark:text-slate-300" aria-hidden />
                    {s.openedBy ? (
                      <span>
                        {s.openedBy} <span className="text-xs text-slate-600 dark:text-slate-300">· {whenOf(s.openedAt)}</span>
                      </span>
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300">Not opened yet</span>
                    )}
                  </div>
                  {s.reason && <div className="truncate text-xs text-slate-600 dark:text-slate-300">{s.reason}</div>}
                </div>
                <button type="button" className={btn.danger} onClick={() => setRevoking(s)}>
                  <ShieldOff className="h-4 w-4" aria-hidden /> Revoke
                </button>
              </motion.article>
            );
          })}
        </AnimatePresence>
        {sessions && active.length === 0 && (
          <p className="flex items-center justify-center gap-2 py-4 text-sm text-slate-600 dark:text-slate-300">
            <ShieldOff className="h-4 w-4" aria-hidden /> No open sessions
          </p>
        )}
      </section>

      {/* Past */}
      {past.length > 0 && (
        <section className={cx(card, "p-2")}>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <span>Past ({past.length})</span>
            <motion.span animate={{ rotate: showPast ? 180 : 0 }}>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showPast && (
              <motion.ul {...m("reveal")} className="divide-y divide-slate-100 px-2 dark:divide-slate-800">
                {past.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-xs text-slate-600 dark:text-slate-300">
                    <ModeChip mode={s.mode} />
                    <span>
                      {whenOf(s.startsAt)} → {whenOf(s.revokedAt ?? s.expiresAt)}
                    </span>
                    {s.revokedAt && <span className="font-semibold text-red-700 dark:text-red-300">revoked</span>}
                    {s.openedBy && <span className="ml-auto">{s.openedBy}</span>}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}

      <ConfirmDialog
        isOpen={!!revoking}
        title="Revoke support access?"
        tone="danger"
        confirmText="Revoke"
        isLoading={revokeBusy}
        onConfirm={revoke}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
};

export default SupportAccessPage;
