import React, { useEffect, useState } from "react";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { CheckCircle2, Clock, Loader2, Pencil, Trash2 } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { surface, sectionTitle, accent } from "../../design/surfaces";
import {
  type AttendanceGmail,
  EMAIL_RE,
  errorText,
  isGmail,
  linkMyGoogle,
  readMyAttendanceGmail,
  removeMyAttendanceGmail,
  saveMyAttendanceGmail,
} from "./attendanceGmail";

/**
 * The Google account a person checks in with on the staff attendance clock (Tendo
 * /c/<school>). Needed only when their Amashuri e-mail is not a Google account.
 * Two ways: type the Gmail (PUT, confirmed the first time it signs in on the
 * check-in page) or sign in with Google here (POST, linked at once).
 * Tendo and the Home notice link here: /profile#staff-attendance.
 */

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "";

const btn = `inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 ${accent.focus}`;
const ghost = `${btn} border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-800/50`;

const AttendanceGoogleCard: React.FC<{ email?: string | null }> = ({ email }) => {
  const { showToast } = useToast();
  const [state, setState] = useState<AttendanceGmail | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    readMyAttendanceGmail()
      .then((s) => alive && setState(s))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // Tendo's check-in page and the Home notice link here: bring the card into view.
  useEffect(() => {
    if (window.location.hash !== "#staff-attendance" || (!state && !failed)) return;
    document.getElementById("staff-attendance")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state, failed]);

  const run = async (work: () => Promise<AttendanceGmail | null>, ok: string) => {
    setBusy(true);
    setError(null);
    try {
      setState(await work());
      setEditing(false);
      showToast(ok, "success");
    } catch (err: any) {
      const msg = errorText(err, "Could not save");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  const saveTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!EMAIL_RE.test(v)) {
      setError("Enter a valid e-mail address, like name@gmail.com");
      return;
    }
    void run(() => saveMyAttendanceGmail(v), "Gmail saved. Use it on the check-in page.");
  };

  const onGoogle = (resp: CredentialResponse) => {
    if (resp.credential) void run(() => linkMyGoogle(resp.credential!), "Google account linked for attendance");
  };

  const showForm = !!state && (editing || !state.linked);
  const amashuriIsGmail = isGmail(email);

  return (
    <section id="staff-attendance" className={`${surface.card} scroll-mt-24`} aria-busy={!state && !failed}>
      <header className="px-5 pt-5 sm:px-6">
        <h2 className={sectionTitle}>Staff attendance</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">The Gmail you check in with on your phone.</p>
      </header>
      <div className="space-y-4 px-5 py-5 sm:px-6">
        {!state && !failed && <div className={`h-16 ${surface.skeleton}`} />}
        {failed && <p className="text-sm text-gray-500 dark:text-gray-400">Could not load this right now.</p>}

        {state?.linked && !editing && (
          <div className={`${surface.inset} flex flex-wrap items-center gap-3 p-3`}>
            {state.verified ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm font-medium text-gray-900 dark:text-white">{state.google_email || email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {state.verified ? "Ready: this account checks you in" : "Saved. Sign in with it once on your school’s check-in page to confirm it."}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={ghost}
                disabled={busy}
                onClick={() => {
                  setValue(state.google_email ?? "");
                  setError(null);
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden /> Change
              </button>
              <button type="button" className={ghost} disabled={busy} onClick={() => void run(removeMyAttendanceGmail, "Removed")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Remove
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <>
            {!state!.linked && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {amashuriIsGmail ? (
                  <>
                    <span className="break-all font-medium">{email}</span> is a Gmail, so it already works. Add another only if your phone uses a different one.
                  </>
                ) : email ? (
                  <>
                    Your Amashuri e-mail <span className="break-all font-medium">{email}</span> is not a Gmail. Type the Gmail you use on your phone.
                  </>
                ) : (
                  "Type the Gmail you use on your phone."
                )}
              </p>
            )}
            <form noValidate onSubmit={saveTyped} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <label htmlFor="att-gmail" className="sr-only">
                  Gmail used on your phone
                </label>
                <input
                  id="att-gmail"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={value}
                  maxLength={255}
                  autoFocus={editing}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  placeholder="name@gmail.com"
                  aria-invalid={!!error}
                  className={surface.input}
                />
                {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
              </div>
              <div className="flex gap-2">
                <button type="submit" className={`${btn} ${accent.solid}`} disabled={busy || !value.trim()}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Save
                </button>
                {editing && (
                  <button type="button" className={ghost} disabled={busy} onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
            {GOOGLE_CLIENT_ID && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className={`h-px flex-1 border-t ${surface.divider}`} />
                  or, on the phone itself
                  <span className={`h-px flex-1 border-t ${surface.divider}`} />
                </div>
                <div className={busy ? "pointer-events-none opacity-60" : ""}>
                  <GoogleLogin
                    onSuccess={onGoogle}
                    onError={() => showToast("Google sign-in was cancelled", "error")}
                    shape="pill"
                    text="signin_with"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default AttendanceGoogleCard;
