import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Info, KeyRound, Loader2 } from "lucide-react";
import Modal from "../ui/Modal";
import SchoolMark from "./SchoolMark";
import { SwitchError, switchSchool, type MySchool } from "../../lib/schoolSwitch";
import { useToast } from "../../contexts/ToastContext";

/**
 * Confirm a school switch (TENANT_SWITCHING_PLAN.md §4.4).
 *
 * Layout: the two schools stacked (from above, to below) with their full names,
 * a short "what happens" list, the target school's password only when the server
 * asks for it, and two equal-height actions. On success the new session is
 * stored and the browser goes to `next` (a full load, so nothing of the old
 * school stays in memory).
 */
interface Props {
  from: MySchool | null;
  to: MySchool | null;
  next?: string;
  onClose: () => void;
}

const SchoolLine: React.FC<{ school: MySchool; label: string; emphasis?: boolean }> = ({ school, label, emphasis }) => (
  <div className="flex items-center gap-3.5 px-4 py-4">
    <SchoolMark name={school.name} logoUrl={school.logoUrl} size="lg" className="rounded-xl ring-1 ring-gray-200 dark:ring-gray-700" />
    <div className="min-w-0 flex-1">
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${emphasis ? "text-blue-600 dark:text-blue-300" : "text-gray-500 dark:text-gray-400"}`}>{label}</p>
      <p
        className={`mt-0.5 line-clamp-2 break-words leading-snug ${emphasis ? "text-[15px] font-semibold text-gray-900 dark:text-white" : "text-sm font-medium text-gray-700 dark:text-gray-200"}`}
        title={school.name}
      >
        {school.name}
      </p>
    </div>
  </div>
);

const SwitchSchoolDialog: React.FC<Props> = ({ from, to, next = "/home", onClose }) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (to) {
      setNeedPassword(false);
      setPassword("");
      setError(null);
    }
  }, [to]);
  useEffect(() => {
    if (needPassword) pwRef.current?.focus();
  }, [needPassword]);

  const go = async () => {
    if (!to) return;
    setBusy(true);
    setError(null);
    try {
      await switchSchool(to.slug, needPassword ? password : undefined);
      showToast(`Switched to ${to.name}`, "success");
      window.location.assign(next);
    } catch (err) {
      const e = err as SwitchError;
      if (e.code === "PASSWORD_REQUIRED") {
        setNeedPassword(true);
        setError(null);
      } else {
        setError(e.message);
        showToast(e.message, "error");
      }
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={!!to} onClose={() => !busy && onClose()} title="Switch school" size="md">
      {to && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void go();
          }}
        >
          <p className="-mt-1 text-sm text-gray-600 dark:text-gray-300">Your NGA apps on this device will open in the school you pick.</p>

          {/* From → to: one panel, two rows, a connector on the divider. */}
          <div className="relative rounded-2xl border border-gray-200 bg-gray-50/60 dark:border-gray-700/70 dark:bg-gray-800/40">
            {from && <SchoolLine school={from} label="Currently in" />}
            {from && (
              <div className="relative h-px bg-gray-200 dark:bg-gray-700/70" aria-hidden="true">
                <span className="absolute left-[2.5rem] top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-300">
                  <ArrowDown className="h-3 w-3" />
                </span>
              </div>
            )}
            <SchoolLine school={to} label="Switching to" emphasis />
          </div>

          {/* What happens */}
          <div className="rounded-2xl bg-blue-50 px-4 py-3.5 dark:bg-blue-500/10">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-blue-800 dark:text-blue-200">
              <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
              What happens
            </p>
            <ul className="mt-2 space-y-1.5 pl-6 text-[13px] leading-snug text-gray-700 dark:text-gray-200">
              {[
                "Task Mentor, Tendo and Tupo on this device follow.",
                "Unsaved changes in open pages are lost, so save them first.",
                "Your other devices stay where they are.",
              ].map((line) => (
                <li key={line} className="relative before:absolute before:-left-3.5 before:top-[0.45rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-blue-500 dark:before:bg-blue-300">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {needPassword && (
            <div className="space-y-1.5">
              <label htmlFor="switch-password" className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                Your password for {to.name}
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  id="switch-password"
                  ref={pwRef}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-full border border-gray-300 bg-white pl-10 pr-4 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Your account there has its own password. You only need it for this switch.</p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-11 rounded-full border border-gray-300 px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || (needPassword && !password)}
              className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Switching…" : "Switch school"}
              {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default SwitchSchoolDialog;
