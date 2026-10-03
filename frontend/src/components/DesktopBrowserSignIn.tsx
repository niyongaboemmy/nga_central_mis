import React, { useEffect, useState } from "react";
import Login from "./Login";
import api from "../services/api";
import { checkSession, logout } from "../api/auth";
import { getUserFromToken } from "../utils/auth";
import { validDesktopChallenge, validDesktopRedirect, validDesktopState } from "../desktop/ngaDesktop";

/**
 * `/desktop/signin`: opened by the NGA desktop app in the person's normal
 * browser (desktop/ngaDesktop.ts). Like Postman: sign in here by any method,
 * or continue with the session this browser already has, then hand a
 * one-time code back to the app.
 */
const DesktopBrowserSignIn: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect_uri");
  const state = params.get("state");
  const challenge = params.get("challenge");
  const valid = validDesktopRedirect(redirect) && validDesktopState(state) && validDesktopChallenge(challenge);
  const [phase, setPhase] = useState<"checking" | "signed-in" | "signed-out" | "sending" | "error">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!valid) return;
    checkSession()
      .then(() => setPhase("signed-in"))
      .catch(() => setPhase("signed-out"));
  }, [valid]);

  const handOff = async () => {
    setPhase("sending");
    try {
      const res = await api.post("/auth/desktop-handoff", { challenge });
      const code: string = res.data?.data?.code;
      // A form POST to the app's loopback address (not a URL), so the code
      // never sits in browser history.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = redirect!;
      for (const [name, value] of [["code", code], ["state", state!]] as const) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Couldn't finish signing in to the NGA app.");
      setPhase("error");
    }
  };

  const card = (children: React.ReactNode) => (
    <div className="min-h-screen grid place-items-center bg-gray-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
        <img src="/android-chrome-192x192.png" alt="" className="mx-auto mb-4 h-12 w-12 rounded-xl" />
        {children}
      </div>
    </div>
  );

  if (!valid) {
    return card(
      <>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Sign in to the NGA app</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Open this page from the NGA desktop app: on its sign-in screen, choose "Continue with Google".
        </p>
      </>,
    );
  }
  if (phase === "signed-out") return <Login onLoginSuccess={handOff} />;
  if (phase === "checking") return card(<p className="text-sm text-gray-500">Checking your NGA MIS session…</p>);
  if (phase === "sending") {
    return card(
      <>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Opening the NGA app…</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">You're signed in. You can close this tab.</p>
      </>,
    );
  }
  const user = getUserFromToken();
  return card(
    <>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Sign in to the NGA app</h1>
      {phase === "error" && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <p className="mt-2 mb-6 text-sm text-gray-500 dark:text-gray-400">
        You're signed in to NGA MIS in this browser{user?.username ? ` as ${user.username}` : ""}.
      </p>
      <button
        onClick={handOff}
        className="w-full h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
      >
        Continue to the NGA app
      </button>
      <button
        onClick={async () => {
          await logout().catch(() => undefined);
          setPhase("signed-out");
        }}
        className="mt-3 w-full h-10 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
      >
        Use a different account
      </button>
    </>,
  );
};

export default DesktopBrowserSignIn;
