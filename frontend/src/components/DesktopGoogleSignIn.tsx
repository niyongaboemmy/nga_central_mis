import React, { useState } from "react";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { validDesktopRedirect, validDesktopState } from "../desktop/ngaDesktop";

/**
 * `/desktop/google`: opened by the NGA desktop app in the person's normal
 * browser (see desktop/ngaDesktop.ts). Signs in with Google here, then hands
 * the Google credential to the desktop app's one-time loopback address.
 */
const DesktopGoogleSignIn: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect_uri");
  const state = params.get("state");
  const [status, setStatus] = useState<"ready" | "sending" | "error">("ready");
  const valid = validDesktopRedirect(redirect) && validDesktopState(state);

  const send = (res: CredentialResponse) => {
    if (!valid || !res.credential) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    // A form POST (not a URL) so the credential never sits in browser history.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = redirect;
    for (const [name, value] of [["credential", res.credential], ["state", state]] as const) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
        <img src="/android-chrome-192x192.png" alt="" className="mx-auto mb-4 h-12 w-12 rounded-xl" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Sign in to the NGA app</h1>
        {!valid ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Open this page from the NGA desktop app: on its sign-in screen, choose "Continue with Google".
          </p>
        ) : status === "sending" ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Signing you in to the NGA app…</p>
        ) : (
          <>
            <p className="mt-2 mb-6 text-sm text-gray-500 dark:text-gray-400">
              Continue with Google. You'll go back to the NGA app afterwards.
            </p>
            <div className="flex justify-center">
              <GoogleLogin onSuccess={send} onError={() => setStatus("error")} theme="outline" size="large" shape="pill" text="continue_with" />
            </div>
            {status === "error" && (
              <p className="mt-4 text-sm text-red-600">Google sign-in didn't finish. Try again, or start again from the NGA app.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DesktopGoogleSignIn;
