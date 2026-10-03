import React, { useEffect, useState } from "react";
import axios from "axios";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import Login from "./Login";
import { API_BASE_URL } from "../services/api";
import { googleLogin, logout } from "../api/auth";
import { getUserFromToken, isAuthenticated } from "../utils/auth";
import { validDesktopChallenge, validDesktopRedirect, validDesktopState } from "../desktop/ngaDesktop";

/**
 * Calls made by this page skip the shared client's 401 handling on purpose:
 * that handler drops a stale token AND sends the page to "/", which lost the
 * desktop app's sign-in request. The person then signed in to MIS in the
 * browser only and had to start Google over from the app. Here a 401 just
 * means "not signed in": clear the stale token and show the sign-in form.
 */
const desktopApi = axios.create({ baseURL: API_BASE_URL, withCredentials: true });
desktopApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
const dropStaleToken = () => {
  try {
    localStorage.removeItem("token");
  } catch {
    /* ignore */
  }
};

/**
 * `/desktop/signin`: opened by the NGA desktop app in the person's normal
 * browser (desktop/ngaDesktop.ts). Like Postman: sign in here by any method,
 * or continue with the session this browser already has, then hand a
 * one-time code back to the app.
 */
const DesktopBrowserSignIn: React.FC = () => {
  // An expired token from an earlier visit: forget it before anything uses it.
  useState(() => {
    if (localStorage.getItem("token") && !isAuthenticated()) dropStaleToken();
    return null;
  });
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect_uri");
  const state = params.get("state");
  const challenge = params.get("challenge");
  // The person already chose Google in the app: go straight to Google here,
  // not MIS's whole sign-in form again.
  const viaGoogle = params.get("via") === "google";
  const [fullForm, setFullForm] = useState(!viaGoogle);
  const valid = validDesktopRedirect(redirect) && validDesktopState(state) && validDesktopChallenge(challenge);
  const [phase, setPhase] = useState<"checking" | "signed-in" | "signed-out" | "sending" | "error">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!valid) return;
    desktopApi
      .get("/auth/session")
      .then(() => setPhase("signed-in"))
      .catch(() => {
        // Not signed in (or an old token): sign in right here, on this page.
        dropStaleToken();
        setPhase("signed-out");
      });
  }, [valid]);

  const handOff = async () => {
    setPhase("sending");
    try {
      const res = await desktopApi.post("/auth/desktop-handoff", { challenge });
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
      if (e?.response?.status === 401) {
        // The session ended meanwhile: sign in again on this same page.
        dropStaleToken();
        setPhase("signed-out");
        return;
      }
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
  const onGoogle = async (res: CredentialResponse) => {
    if (!res.credential) {
      setError("Google sign-in didn't finish. Try again.");
      return;
    }
    setPhase("sending");
    try {
      await googleLogin(res.credential); // MIS session in this browser (POST /auth/google)
      await handOff();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Google sign-in failed. Try again.");
      setPhase("signed-out");
    }
  };

  if (phase === "signed-out" && fullForm) return <Login onLoginSuccess={handOff} />;
  if (phase === "signed-out") {
    return card(
      <>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Sign in to the NGA app</h1>
        <p className="mt-2 mb-6 text-sm text-gray-500 dark:text-gray-400">Continue with your Google account.</p>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex justify-center">
          {/* One Tap + auto_select: a returning person is often signed in without a click. */}
          <GoogleLogin
            onSuccess={onGoogle}
            onError={() => setError("Google sign-in was cancelled or failed. Try again.")}
            useOneTap
            auto_select
            theme="outline"
            size="large"
            shape="pill"
            text="continue_with"
            width={300}
          />
        </div>
        <button
          onClick={() => setFullForm(true)}
          className="mt-6 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Use email and password instead
        </button>
      </>,
    );
  }
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
