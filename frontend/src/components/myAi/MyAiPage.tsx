import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, KeyRound, ListTree, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardTitle, EmptyState, Muted, Spinner, primaryBtn, secondaryBtn } from "../officeHours/ohUi";
import { loadAiPolicy } from "../../api/aiPolicy";
import { errorMessage, myAiApi, type MyAiCredential, type MyAiView } from "../../api/myAi";
import { forgetResolved } from "../ai/AiSourceControl";
import AddAiWizard from "./AddAiWizard";
import CredentialCard from "./CredentialCard";
import RoutesEditor from "./RoutesEditor";
import TryIt from "./TryIt";
import { statusSummary } from "./routesModel";
import { forgetModels } from "./useModels";

/**
 * My AI (/my-ai, PERSONAL_AI_PROVIDERS_PLAN.md §9.1): connect your own AI keys and choose
 * which AI answers what. School AI stays the free default for everything you don't set.
 */

/** Friendlier words for why My AI isn't available, keyed by the server's code. */
const BLOCKED_HELP: Record<string, string> = {
  AI_VAULT_NOT_CONFIGURED: "The server needs a key vault before anyone can store AI keys. Until then everyone uses School AI, which keeps working as before.",
  AI_DISABLED: "While AI is off, no AI answers anywhere, School AI included.",
  PERSONAL_OFF: "Everyone uses School AI, which is free. A super admin can let people add their own keys in Settings → AI.",
  APP_OFF: "Everyone uses School AI in the MIS. A super admin can turn My AI on for the MIS in Settings → AI.",
  NOT_ALLOWED: "Your role uses School AI, which is free. If you need your own AI keys, ask a school administrator.",
};
/** Codes a super admin can fix in Settings → AI. */
const ADMIN_FIXABLE = new Set(["AI_DISABLED", "PERSONAL_OFF", "APP_OFF", "NOT_ALLOWED"]);

const StatusStrip: React.FC<{ view: MyAiView }> = ({ view }) => {
  const s = statusSummary(view.routes, view.credentials);
  return (
    <div role="status" className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-soft dark:border-gray-700/30 dark:bg-gray-800/30">
      <Sparkles className="mt-0.5 h-5 w-5 flex-none text-blue-600 dark:text-blue-400" aria-hidden />
      <div className="min-w-0 text-sm text-slate-800 dark:text-gray-100">
        <span className="font-semibold">Your AI in the MIS: </span>
        {!s.mine ? (
          <strong>School AI (free)</strong>
        ) : (
          <>
            {s.parts.map((p, i) => (
              <span key={`${p.who}-${p.model}`}>
                {i > 0 && "; "}
                <strong>
                  {p.who}
                  {p.model ? ` · ${p.model}` : ""}
                </strong>{" "}
                for {p.tasks.length === 5 ? "everything" : p.tasks.join(", ").toLowerCase()}
                {p.attention && <span className="text-amber-800 dark:text-amber-200"> (needs attention, so School AI answers)</span>}
              </span>
            ))}
            {s.restSchool && (
              <span>
                ; <strong>School AI</strong> for everything else
              </span>
            )}
          </>
        )}
        {view.me.isStudent && view.policy.studentDailyLimit != null && (
          <Muted className="mt-1 !text-xs">Students can make up to {view.policy.studentDailyLimit} requests a day with their own keys.</Muted>
        )}
        {view.policy.inAssessments === "never" && <Muted className="mt-1 !text-xs">Inside quizzes and assignments, School AI always answers.</Muted>}
      </div>
    </div>
  );
};

const MyAiPage: React.FC = () => {
  const [view, setView] = useState<MyAiView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await myAiApi.get();
      setView(r.data.data);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load My AI."));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAiPolicy().then((p) => setCanManage(!!p?.me.canManage));
  }, [load]);

  const changed = () => {
    forgetResolved();
    void load();
  };

  const onCredential = (id: number) => (c: MyAiCredential | null) => {
    forgetResolved();
    forgetModels(id);
    if (!c) return void load(); // deleted: routes using it went too
    setView((v) => (v ? { ...v, credentials: v.credentials.map((x) => (x.id === id ? c : x)) } : v));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <KeyRound className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> My AI
          </h1>
          <Muted className="mt-1">Use your own AI accounts in NGA apps, and choose which AI answers what. School AI stays the free default.</Muted>
        </div>
        {view && !view.blocked && (
          <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add AI
          </button>
        )}
      </header>

      {error ? (
        <EmptyState title="My AI" body={error} action={<button type="button" className={secondaryBtn} onClick={() => void load()}>Try again</button>} />
      ) : !view ? (
        <Spinner label="Loading My AI" />
      ) : view.blocked ? (
        <Card labelledBy="myai-blocked">
          <CardTitle id="myai-blocked" icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
            My AI isn't available
          </CardTitle>
          <p className="text-base font-semibold text-slate-900 dark:text-white">{view.blocked.message}</p>
          {BLOCKED_HELP[view.blocked.code] && <Muted className="mt-1">{BLOCKED_HELP[view.blocked.code]}</Muted>}
          {canManage && ADMIN_FIXABLE.has(view.blocked.code) && (
            <Link to="/settings" className={`${secondaryBtn} mt-3`}>
              Open Settings → AI
            </Link>
          )}
        </Card>
      ) : (
        <>
          <StatusStrip view={view} />

          <Card labelledBy="myai-keys">
            <CardTitle id="myai-keys" icon={<KeyRound className="h-4 w-4" aria-hidden />}>
              Connected providers
            </CardTitle>
            {view.credentials.length === 0 ? (
              <EmptyState
                title="Add your first AI"
                body="Use your own paid or free AI account, for example a stronger model for longer lesson notes, or a free OpenRouter account. Only you can use your keys."
                action={
                  <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> Add AI
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {view.credentials.map((c) => (
                  <CredentialCard key={c.id} credential={c} isStudent={view.me.isStudent} apps={view.apps} onChanged={onCredential(c.id)} />
                ))}
              </div>
            )}
          </Card>

          {view.credentials.length > 0 && (
            <Card labelledBy="myai-routes">
              <CardTitle id="myai-routes" icon={<ListTree className="h-4 w-4" aria-hidden />}>
                What answers what
              </CardTitle>
              <RoutesEditor
                credentials={view.credentials}
                routes={view.routes}
                apps={view.apps}
                schoolFallback={view.policy.fallbackToSchool}
                onSaved={(routes) => {
                  forgetResolved();
                  setView((v) => (v ? { ...v, routes } : v));
                }}
              />
            </Card>
          )}

          {view.credentials.length > 0 && (
            <Card labelledBy="myai-try">
              <CardTitle id="myai-try" icon={<FlaskConical className="h-4 w-4" aria-hidden />}>
                Try it
              </CardTitle>
              <TryIt credentials={view.credentials} />
            </Card>
          )}

          <Muted className="!text-xs">
            Your keys are encrypted and only used for your own requests. Nobody at school can see them; administrators see only totals. Models listed from the
            catalogue of {view.catalogDate ? new Date(view.catalogDate).toLocaleDateString(undefined, { dateStyle: "medium" }) : "this release"}.
          </Muted>

          <AddAiWizard
            isOpen={adding}
            onClose={() => setAdding(false)}
            providers={view.providers}
            routes={view.routes}
            isStudent={view.me.isStudent}
            onDone={() => {
              setAdding(false);
              changed();
            }}
          />
        </>
      )}
    </div>
  );
};

export default MyAiPage;
