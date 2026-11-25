import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Loader2, X } from "lucide-react";
import { useUser } from "../../contexts/UserContext";
import { useToast } from "../../contexts/ToastContext";
import { surface, accent } from "../../design/surfaces";
import { EMAIL_RE, errorText, isGmail, readMyAttendanceGmail, saveMyAttendanceGmail } from "./attendanceGmail";

/**
 * Home: staff whose Amashuri e-mail is not a Gmail and who have not named the Gmail
 * they check in with see this once, with the box right here and a shortcut to the
 * profile card. Hidden for students, Gmail addresses, linked accounts, and after
 * "Not now" (remembered on this device for 14 days).
 */
const SNOOZE_DAYS = 14;
const snoozeKey = (uid: number) => `amashuri.attendanceGmail.snooze.${uid}`;

const AttendanceGmailNotice: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const uid = user?.user?.user_id;
  const email = user?.user?.email ?? null;
  const type = String(user?.profile?.user_type ?? "").toUpperCase();
  const eligible = !!uid && type !== "STUDENT" && type !== "PARENT" && !isGmail(email);

  const [show, setShow] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eligible || !uid) return;
    const until = Number(localStorage.getItem(snoozeKey(uid)) || 0);
    if (until > Date.now()) return;
    let alive = true;
    readMyAttendanceGmail()
      .then((s) => alive && setShow(!!s && !s.linked))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [eligible, uid]);

  if (!show || !uid) return null;

  const snooze = () => {
    localStorage.setItem(snoozeKey(uid), String(Date.now() + SNOOZE_DAYS * 86_400_000));
    setShow(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!EMAIL_RE.test(v)) {
      setError("Enter a valid e-mail address, like name@gmail.com");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveMyAttendanceGmail(v);
      showToast("Gmail saved. Use it on your school’s check-in page.", "success");
      setShow(false);
    } catch (err: any) {
      const msg = errorText(err, "Could not save");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      role="region"
      aria-label="Add the Gmail you check in with"
      data-testid="attendance-gmail-notice"
      className="relative rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10 sm:p-5"
    >
      <button
        type="button"
        onClick={snooze}
        aria-label="Not now"
        className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-500/20 ${accent.focus}`}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex gap-3 pr-8">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-100">Add the Gmail you check in with</p>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200/90">
              Staff check-in uses Google sign-in{email ? <>, and <span className="break-all font-medium">{email}</span> is not a Gmail</> : ""}. Type the Gmail on your phone once.
            </p>
          </div>
          <form noValidate onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 sm:max-w-sm">
              <label htmlFor="home-att-gmail" className="sr-only">
                Gmail used on your phone
              </label>
              <input
                id="home-att-gmail"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={value}
                maxLength={255}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder="name@gmail.com"
                aria-invalid={!!error}
                className={`${surface.input} bg-white dark:bg-gray-900/60`}
              />
              {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={busy || !value.trim()}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 ${accent.solid} ${accent.focus}`}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Save
              </button>
              <Link
                to="/profile#staff-attendance"
                className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-500/20 ${accent.focus}`}
              >
                Other options <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default AttendanceGmailNotice;
