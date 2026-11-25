import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Smartphone } from "lucide-react";
import api from "../../services/api";
import { useToast } from "../../contexts/ToastContext";
import { surface, accent } from "../../design/surfaces";

/**
 * Admin side of the staff attendance Google account (Tendo check-in, /c/<school>).
 * Staff whose Amashuri e-mail is not a Google account check in with another Gmail;
 * someone with MANAGE_USERS enters it here (PUT /users/:id/attendance-google).
 * The person then signs in with it once on the check-in page and it becomes "Linked".
 */
interface LinkState {
  linked: boolean;
  google_email: string | null;
  verified: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AttendanceGoogleAdmin: React.FC<{ userId: number; amashuriEmail?: string | null }> = ({ userId, amashuriEmail }) => {
  const { showToast } = useToast();
  const [state, setState] = useState<LinkState | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setState(null);
    setFailed(false);
    api
      .get(`/users/${userId}/attendance-google`)
      .then((r) => alive && setState(r.data?.data ?? null))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [userId]);

  const save = async (email: string | null) => {
    const clean = email?.trim().toLowerCase() || null;
    if (clean && !EMAIL_RE.test(clean)) {
      setError("Enter a valid e-mail address");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.put(`/users/${userId}/attendance-google`, { email: clean });
      setState(r.data?.data ?? null);
      setEditing(false);
      showToast(clean ? "Attendance Google account saved" : "Attendance Google account removed", "success");
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Could not save";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setValue(state?.google_email ?? "");
    setError(null);
    setEditing(true);
  };

  const btn = `inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 ${accent.focus}`;
  const ghost = `${btn} border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-800/50`;

  return (
    <section aria-busy={!state && !failed} data-testid="attendance-google-admin">
      <div className="flex items-center justify-between mb-4 ml-1">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5" />
          Staff attendance
        </h3>
      </div>
      <div className={`${surface.card} p-5 space-y-3`}>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          The Google account this person checks in with on their phone.{" "}
          {amashuriEmail ? (
            <>
              If <span className="break-all font-medium">{amashuriEmail}</span> is a Google account, nothing is needed.
            </>
          ) : (
            "This person has no Amashuri e-mail, so add their Gmail here."
          )}
        </p>

        {!state && !failed && <div className={`h-12 ${surface.skeleton}`} />}
        {failed && <p className="text-sm text-gray-500 dark:text-gray-400">Could not load this right now.</p>}

        {state && !editing && (
          <div className={`${surface.inset} flex flex-wrap items-center gap-3 p-3`}>
            {state.google_email ? (
              <>
                {state.verified ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                ) : (
                  <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium text-gray-900 dark:text-white">{state.google_email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {state.verified ? "Linked: they have signed in with it" : "Waiting: they sign in with it once on the check-in page"}
                  </p>
                </div>
              </>
            ) : (
              <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">
                {state.verified ? "Signs in with their Amashuri e-mail (linked)." : "No separate Google account."}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" className={ghost} onClick={startEdit} disabled={busy}>
                {state.google_email ? "Change" : "Add Gmail"}
              </button>
              {state.google_email && (
                <button type="button" className={ghost} onClick={() => void save(null)} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Remove
                </button>
              )}
            </div>
          </div>
        )}

        {state && editing && (
          <form
            noValidate
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save(value);
            }}
          >
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400" htmlFor={`att-google-${userId}`}>
              Gmail used on their phone
            </label>
            <input
              id={`att-google-${userId}`}
              type="email"
              autoFocus
              value={value}
              maxLength={255}
              onChange={(e) => setValue(e.target.value)}
              placeholder="name@gmail.com"
              className={surface.input}
              aria-invalid={!!error}
            />
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className={`${btn} ${accent.solid}`} disabled={busy || !value.trim()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Save
              </button>
              <button type="button" className={ghost} onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
};

export default AttendanceGoogleAdmin;
