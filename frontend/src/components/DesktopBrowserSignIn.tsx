import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import Login from "./Login";
import { API_BASE_URL } from "../services/api";
import { googleLogin, logout } from "../api/auth";
import { getUserFromToken, isAuthenticated } from "../utils/auth";
import {
  DESKTOP_NONCE_KEY,
  googleAuthUrl,
  idTokenNonce,
  validDesktopChallenge,
  validDesktopRedirect,
  validDesktopState,
} from "../desktop/ngaDesktop";

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "";

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
  const [phase, setPhase] = useState<"checking" | "signed-in" | "signed-out" | "redirecting" | "sending" | "error">(
    "checking",
  );
  const [error, setError] = useState("");
  const started = useRef(false);

  /** Straight to Google's own account chooser; it returns to "/" (see main.tsx). */
  const startGoogle = (chooseAccount = false) => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    try {
      sessionStorage.setItem(DESKTOP_NONCE_KEY, nonce);
    } catch {
      /* the nonce check below will then refuse, safely */
    }
    setPhase("redirecting");
    window.location.assign(
      googleAuthUrl(GOOGLE_CLIENT_ID, window.location.origin, { redirect: redirect!, state: state!, challenge: challenge! }, nonce, chooseAccount),
    );
  };

  useEffect(() => {
    if (!valid || started.current) return;
    started.current = true;

    // Back from Google (main.tsx put its answer in the fragment).
    const back = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (back.has("id_token") || back.has("error")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      const idToken = back.get("id_token");
      let expected: string | null = null;
      try {
        expected = sessionStorage.getItem(DESKTOP_NONCE_KEY);
        sessionStorage.removeItem(DESKTOP_NONCE_KEY);
      } catch {
        /* ignore */
      }
      if (!idToken || !expected || idTokenNonce(idToken) !== expected) {
        setError(back.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in didn't finish. Try again.");
        setPhase("signed-out");
        return;
      }
      setPhase("sending");
      googleLogin(idToken) // the MIS session in this browser (POST /auth/google)
        .then(() => handOff())
        .catch((e: any) => {
          setError(e?.response?.data?.message || "Google sign-in failed. Try again.");
          setPhase("signed-out");
        });
      return;
    }

    desktopApi
      .get("/auth/session")
      .then(() => setPhase("signed-in"))
      .catch(() => {
        // Not signed in (or an old token).
        dropStaleToken();
        // The person chose Google in the app: go straight to Google.
        if (viaGoogle && GOOGLE_CLIENT_ID) startGoogle();
        else setPhase("signed-out");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  if (phase === "signed-out" && fullForm) return <Login onLoginSuccess={handOff} />;
  if (phase === "signed-out") {
    return card(
      <>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Sign in to the NGA app</h1>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          onClick={() => startGoogle(true)}
          className="mt-6 w-full h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          Continue with Google
        </button>
        <button
          onClick={() => setFullForm(true)}
          className="mt-6 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Use email and password instead
        </button>
      </>,
    );
  }
  if (phase === "checking" || phase === "redirecting") {
    return card(<p className="text-sm text-gray-500">{phase === "redirecting" ? "Opening Google…" : "One moment…"}</p>);
  }
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
          dropStaleToken();
          if (viaGoogle && GOOGLE_CLIENT_ID) startGoogle(true);
          else setPhase("signed-out");
        }}
        className="mt-3 w-full h-10 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
      >
        Use a different account
      </button>
    </>,
  );
};

export default DesktopBrowserSignIn;
