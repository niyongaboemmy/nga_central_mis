import React, { useEffect, useRef, useState } from "react";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { Check, Clock, Loader2, Mail, Pencil, Smartphone, Trash2 } from "lucide-react";
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

/** Dark mode follows the <html class="dark"> switch (no provider needed in tests). */
function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Saved → signed in once on the check-in page → ready. */
const Steps: React.FC<{ verified: boolean }> = ({ verified }) => (
  <ol className="flex items-center gap-1.5" aria-label={verified ? "Ready" : "Waiting for the first sign-in"}>
    {[0, 1, 2].map((i) => {
      const on = verified || i === 0;
      return (
        <li key={i} className="flex flex-1 items-center gap-1.5">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              on ? "bg-blue-600 text-white" : i === 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
            }`}
          >
            {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : i === 1 ? <Smartphone className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
          </span>
          {i < 2 && <span className={`h-0.5 flex-1 rounded-full ${verified ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"}`} />}
        </li>
      );
    })}
  </ol>
);

const AttendanceGoogleCard: React.FC<{ email?: string | null }> = ({ email }) => {
  const dark = useDarkMode();
  const googleBox = useRef<HTMLDivElement>(null);
  const [googleWidth, setGoogleWidth] = useState(280);
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
  // Google's button takes a pixel width: match the card (it is narrow in the side column).
  useEffect(() => {
    const el = googleBox.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setGoogleWidth(Math.max(200, Math.min(400, Math.floor(el.clientWidth)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showForm]);
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
          <div className={`${surface.inset} space-y-4 p-4`}>
            <div className="flex items-center gap-3">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
                  <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
                </svg>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full ring-2 ring-gray-50 dark:ring-gray-800 ${
                    state.verified ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                  }`}
                  style={{ width: 18, height: 18 }}
                >
                  {state.verified ? <Check className="h-3 w-3" strokeWidth={3.5} aria-hidden /> : <Clock className="h-3 w-3" strokeWidth={3} aria-hidden />}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-gray-900 [overflow-wrap:anywhere] dark:text-white" title={state.google_email || email || ""}>
                  {state.google_email || email}
                </p>
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    state.verified
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  }`}
                >
                  {state.verified ? "Ready to check in" : "Waiting for first sign-in"}
                </span>
              </div>
            </div>
            <Steps verified={!!state.verified} />
            {!state.verified && (
              <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">Sign in with it once on your school’s check-in page to confirm it.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
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
            <form noValidate onSubmit={saveTyped} className="flex flex-col gap-2">
              <div className="relative min-w-0">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
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
                  className={`${surface.input} pl-10`}
                />
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" className={`${btn} ${accent.solid} flex-1`} disabled={busy || !value.trim()}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Save
                </button>
                {editing && (
                  <button type="button" className={`${ghost} flex-1`} disabled={busy} onClick={() => setEditing(false)}>
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
                {/* Google's button is an iframe: color-scheme light keeps it from painting a white box in dark mode. */}
                <div ref={googleBox} className={`flex justify-center [color-scheme:light] ${busy ? "pointer-events-none opacity-60" : ""}`}>
                  <GoogleLogin
                    key={dark ? "dark" : "light"}
                    onSuccess={onGoogle}
                    onError={() => showToast("Google sign-in was cancelled", "error")}
                    shape="pill"
                    size="large"
                    theme={dark ? "filled_black" : "outline"}
                    text="signin_with"
                    width={String(googleWidth)}
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
