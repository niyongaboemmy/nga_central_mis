import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, TriangleAlert } from "lucide-react";
import Modal from "../ui/Modal";
import SchoolMark from "./SchoolMark";
import { SwitchError, switchSchool, type MySchool } from "../../lib/schoolSwitch";
import { useToast } from "../../contexts/ToastContext";

/**
 * Confirm a school switch (TENANT_SWITCHING_PLAN.md §4.4): from → to, a warning
 * about unsent work, and the target school's password only when the server asks
 * for it (the two accounts have different passwords). On success the new session
 * is stored and the browser goes to `next` (a full load, so nothing of the old
 * school stays in memory).
 */
interface Props {
  from: MySchool | null;
  to: MySchool | null;
  next?: string;
  onClose: () => void;
}

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
    <Modal isOpen={!!to} onClose={() => !busy && onClose()} title="Switch school" size="sm">
      {to && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void go();
          }}
        >
          <div className="flex items-center gap-3">
            {from && (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <SchoolMark name={from.name} logoUrl={from.logoUrl} size="md" />
                <span className="truncate text-sm text-slate-600 dark:text-slate-300">{from.name}</span>
              </div>
            )}
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <SchoolMark name={to.name} logoUrl={to.logoUrl} size="md" />
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{to.name}</span>
            </div>
          </div>
          {to.roles.length > 0 && <p className="text-xs text-slate-600 dark:text-slate-300">Your role there: {to.roles.join(", ")}</p>}
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Save your work first. Every NGA app on this device moves to {to.name}; your other devices stay where they are.
          </p>
          {needPassword && (
            <div>
              <label htmlFor="switch-password" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Your password for {to.name}
              </label>
              <input
                id="switch-password"
                ref={pwRef}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Your account there has a different password. You'll only be asked once per switch.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || (needPassword && !password)}
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Switch to {to.name}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default SwitchSchoolDialog;
