import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardTitle, Muted, Spinner, secondaryBtn } from "../officeHours/ohUi";
import { useToast } from "../../contexts/ToastContext";
import { errorMessage, myAiApi } from "../../api/myAi";
import { forgetResolved } from "../ai/AiSourceControl";
import { OPENROUTER_FREE_ONLY_KEY } from "./AddAiWizard";

/**
 * /my-ai/openrouter-callback: openrouter.ai sends people back here with ?code (and our
 * ?state). The MIS swaps the code for a key, stores it, and we go back to My AI.
 */
const OpenRouterCallback: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Once: a code can be exchanged only one time (StrictMode runs effects twice in dev).
    if (started.current) return;
    started.current = true;
    const code = params.get("code") ?? "";
    const state = params.get("state") ?? "";
    if (!code) {
      setError(params.get("error_description") || params.get("error") || "OpenRouter didn't send a connection code. Try connecting again.");
      return;
    }
    let freeOnly: boolean | undefined;
    try {
      const v = sessionStorage.getItem(OPENROUTER_FREE_ONLY_KEY);
      sessionStorage.removeItem(OPENROUTER_FREE_ONLY_KEY);
      if (v !== null) freeOnly = v === "1";
    } catch {
      /* storage blocked: the server's default applies */
    }
    myAiApi
      .openRouterComplete({ code, state, ...(freeOnly !== undefined ? { freeOnly } : {}) })
      .then(() => {
        forgetResolved();
        showToast("OpenRouter is connected. Choose what it answers in “What answers what”.", "success");
        navigate("/my-ai", { replace: true });
      })
      .catch((e) => setError(errorMessage(e, "Couldn't finish connecting OpenRouter.")));
  }, [params, navigate, showToast]);

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <Card labelledBy="or-cb">
        <CardTitle id="or-cb">Connecting OpenRouter</CardTitle>
        {error ? (
          <>
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
            <Link to="/my-ai" className={`${secondaryBtn} mt-3`}>
              Back to My AI
            </Link>
          </>
        ) : (
          <>
            <Spinner label="Saving your OpenRouter key" />
            <Muted>This takes a few seconds.</Muted>
          </>
        )}
      </Card>
    </div>
  );
};

export default OpenRouterCallback;
