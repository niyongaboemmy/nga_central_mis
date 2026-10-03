import React, { useEffect, useRef, useState } from "react";
import api from "../services/api";
import { setToken } from "../utils/auth";
import { desktopHandback } from "../desktop/ngaDesktop";

/**
 * `/desktop/complete#code=…&verifier=…`: inside the NGA desktop app's MIS
 * window, after the person signed in in their browser. Redeems the one-time
 * code with the app's PKCE verifier and lands on Home, signed in.
 */
const DesktopSignInComplete: React.FC = () => {
  const [error, setError] = useState("");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const handback = desktopHandback(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname); // don't keep the code around
    if (!handback) {
      setError("This sign-in link is not valid. Start again from the sign-in page.");
      return;
    }
    api
      .post("/auth/desktop-handoff/redeem", handback)
      .then((res) => {
        setToken(res.data.data.token);
        // A full load so every context starts with the new session.
        window.location.replace("/home");
      })
      .catch((e) => setError(e?.response?.data?.message || "Signing in didn't finish. Try again."));
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm text-center">
        {!error ? (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Signing you in…</p>
          </>
        ) : (
          <>
            <p className="text-sm text-red-600">{error}</p>
            <a href="/login" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
              Back to sign-in
            </a>
          </>
        )}
      </div>
    </div>
  );
};

export default DesktopSignInComplete;
