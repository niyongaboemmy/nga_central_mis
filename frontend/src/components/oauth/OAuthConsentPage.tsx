import React, { useCallback, useEffect, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import Login from "../Login";
import { consentApi, leaveTo, type ConsentDetails } from "../../api/mcpConnector";

/**
 * `/oauth/authorize` (public, unwrapped): a person's own Claude or ChatGPT asks to connect to
 * NGA (the NGA connector, backend services/mcp/routes.ts). The API's /oauth/authorize checked
 * the request and sent the browser here with a signed `request`. Sign in if needed, see what
 * NGA will allow, then Allow or Deny; either way the browser goes back to the AI app.
 */

const HELP: Record<string, string> = {
  CONNECTOR_OFF: "A super admin can turn it on in Settings → AI → \"Your own Claude / ChatGPT\".",
  AI_DISABLED: "While AI is off for the school, NGA can't be connected to any AI app.",
  NOT_ALLOWED: "Connecting your own AI apps is for staff whose role includes it. Ask a school administrator if you need it.",
};

const dropStaleToken = () => {
  try {
    localStorage.removeItem("token");
  } catch {
    /* ignore */
  }
};

const OAuthConsentPage: React.FC = () => {
  const request = new URLSearchParams(window.location.search).get("request") || "";
  const [phase, setPhase] = useState<"checking" | "signed-out" | "ready" | "refused" | "error" | "sending">("checking");
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [error, setError] = useState("");
  const [pupilNames, setPupilNames] = useState(false);

  const load = useCallback(async () => {
    setPhase("checking");
    try {
      const r = await consentApi.get(request);
      setDetails(r.data.data);
      setPhase("ready");
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) {
        dropStaleToken();
        setPhase("signed-out");
      } else if (status === 403) {
        setRefusal({ code: e.response.data?.code ?? "", message: e.response.data?.message ?? "You can't connect NGA to this AI app." });
        setPhase("refused");
      } else {
        setError(e?.response?.data?.message || "Couldn't load this request. Start connecting NGA again from your AI app.");
        setPhase("error");
      }
    }
  }, [request]);

  useEffect(() => {
    if (request) void load();
  }, [request, load]);

  const decide = async (decision: "allow" | "deny") => {
    setPhase("sending");
    try {
      const r = await consentApi.decide(request, decision, decision === "allow" && pupilNames);
      leaveTo(r.data.data.redirectTo);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        dropStaleToken();
        setPhase("signed-out");
        return;
      }
      setError(e?.response?.data?.message || "Couldn't finish connecting. Try again from your AI app.");
      setPhase("error");
    }
  };

  const card = (children: React.ReactNode) => (
    <main className="min-h-screen grid place-items-center bg-gray-50 px-4 py-8 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <img src="/android-chrome-192x192.png" alt="" className="mx-auto mb-4 h-12 w-12 rounded-xl" />
        {children}
      </div>
    </main>
  );

  if (!request) {
    return card(
      <>
        <h1 className="text-center text-lg font-semibold text-gray-900 dark:text-white">Connect NGA to your AI</h1>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
          Open this page from Claude or ChatGPT: add NGA as a connector there and choose "Connect".
        </p>
      </>,
    );
  }
  if (phase === "signed-out") return <Login onLoginSuccess={() => void load()} />;
  if (phase === "checking" || phase === "sending") {
    return card(<p className="text-center text-sm text-gray-500 dark:text-gray-400">{phase === "sending" ? "Returning to your AI app…" : "One moment…"}</p>);
  }
  if (phase === "error") {
    return card(
      <>
        <h1 className="text-center text-lg font-semibold text-gray-900 dark:text-white">Couldn't connect NGA</h1>
        <p role="alert" className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
      </>,
    );
  }
  if (phase === "refused" && refusal) {
    return card(
      <>
        <h1 className="text-center text-lg font-semibold text-gray-900 dark:text-white">NGA can't be connected</h1>
        <p role="alert" className="mt-2 text-center text-sm text-gray-700 dark:text-gray-200">{refusal.message}</p>
        {HELP[refusal.code] && <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">{HELP[refusal.code]}</p>}
        <button
          type="button"
          onClick={() => void decide("deny")}
          className="mt-6 h-11 w-full rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"
        >
          Back to the AI app
        </button>
      </>,
    );
  }

  const d = details!;
  return card(
    <>
      <h1 className="text-center text-lg font-semibold text-gray-900 dark:text-white">
        Connect <span className="break-words">{d.client.name}</span> to NGA?
      </h1>
      <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
        {d.client.registeredBySchool ? "Set up by your school. " : ""}
        After you choose, you go back to <strong className="font-medium text-gray-700 dark:text-gray-200">{d.client.redirectHost}</strong>. Your own AI account does
        the thinking; NGA only answers its questions.
      </p>

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">It will be able to</h2>
      <ul className="mt-2 space-y-2">
        {d.scopes.map((s) => (
          <li key={s.scope} className="flex gap-2 text-sm text-gray-800 dark:text-gray-100">
            <Check className="mt-0.5 h-4 w-4 flex-none text-green-600 dark:text-green-400" aria-hidden />
            <span>{s.text}</span>
          </li>
        ))}
        <li className="flex gap-2 text-sm text-gray-800 dark:text-gray-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-blue-600 dark:text-blue-400" aria-hidden />
          <span>Only what you can already see in NGA. You can disconnect any time in My AI.</span>
        </li>
      </ul>

      {d.pupilNamesOption && (
        <label className="mt-5 flex cursor-pointer gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 flex-none"
            checked={pupilNames}
            onChange={(e) => setPupilNames(e.target.checked)}
          />
          <span>
            <strong className="font-semibold">Allow pupil names</strong>
            <span className="mt-0.5 block text-amber-800 dark:text-amber-200">
              Off: pupils appear as "Student 1", "Student 2"… Tick only if you need names, and only for pupils you already teach. They go to your own AI
              account, under its privacy settings.
            </span>
          </span>
        </label>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void decide("deny")}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" aria-hidden /> Deny
        </button>
        <button
          type="button"
          onClick={() => void decide("allow")}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Check className="h-4 w-4" aria-hidden /> Allow
        </button>
      </div>
      <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">Drafts are never published, sent or graded until you confirm them in NGA.</p>
    </>,
  );
};

export default OAuthConsentPage;
