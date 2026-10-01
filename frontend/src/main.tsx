import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UserProvider } from "./contexts/UserContext";
import { initPwa } from "./reminders/pwa";
import { startMisActivity } from "./activity";

// Installable NGA app: capture the install prompt early and register the
// app-wide service worker (REMINDERS_SOLUTION_PROPOSAL.md §7).
initPwa();

// Platform usage analytics & live presence (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md).
startMisActivity();

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || ""}>
      <UserProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </UserProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
);
