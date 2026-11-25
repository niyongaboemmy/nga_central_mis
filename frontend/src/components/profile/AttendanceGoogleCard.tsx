import React, { useEffect, useState } from "react";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { CheckCircle2, Link2Off } from "lucide-react";
import api from "../../services/api";
import { useToast } from "../../contexts/ToastContext";
import { surface, sectionTitle, accent } from "../../design/surfaces";

/**
 * The Google account a person checks in with on the staff attendance clock (Tendo
 * /c/<school>). Needed only when their Amashuri e-mail is not a Google account:
 * they sign in with Google here once and that account is linked
 * (POST /users/me/attendance-google).
 */
interface LinkState {
  linked: boolean;
  google_email: string | null;
  verified: boolean;
}

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "";

const AttendanceGoogleCard: React.FC<{ email?: string | null }> = ({ email }) => {
  const { showToast } = useToast();
  const [state, setState] = useState<LinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/users/me/attendance-google")
      .then((r) => alive && setState(r.data?.data ?? null))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const link = async (resp: CredentialResponse) => {
    if (!resp.credential) return;
    setBusy(true);
    try {
      const r = await api.post("/users/me/attendance-google", { credential: resp.credential });
      setState(r.data?.data ?? null);
      showToast("Google account linked for attendance", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Could not link this Google account", "error");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      const r = await api.delete("/users/me/attendance-google");
      setState(r.data?.data ?? null);
      showToast("Google account unlinked", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Could not unlink", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={surface.card} aria-busy={!state && !failed}>
      <header className="px-5 pt-5 sm:px-6">
        <h2 className={sectionTitle}>Staff attendance</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">The Google account you check in with on your phone.</p>
      </header>
      <div className="space-y-3 px-5 py-5 sm:px-6">
        {!state && !failed && <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />}
        {failed && <p className="text-sm text-gray-500 dark:text-gray-400">Could not load this right now.</p>}
        {state?.linked && state.google_email ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm font-medium text-gray-900 dark:text-white">{state.google_email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{state.verified ? "Linked" : "Set by your school; sign in with it once on the clock page"}</p>
            </div>
            <button
              type="button"
              onClick={() => void unlink()}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-800/50 ${accent.focus}`}
            >
              <Link2Off className="h-3.5 w-3.5" aria-hidden /> Unlink
            </button>
          </div>
        ) : state ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {email ? <>If <span className="break-all font-medium">{email}</span> is a Google account, you need nothing here.</> : "Your account has no e-mail."} Otherwise
              link the Google account you use on your phone.
            </p>
            {GOOGLE_CLIENT_ID ? (
              <div className={busy ? "pointer-events-none opacity-60" : ""}>
                <GoogleLogin onSuccess={(r) => void link(r)} onError={() => showToast("Google sign-in was cancelled", "error")} shape="pill" text="continue_with" />
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">Google sign-in is not set up on this server.</p>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
};

export default AttendanceGoogleCard;
