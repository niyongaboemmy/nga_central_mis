import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AppWindow, Download } from "lucide-react";
import { openAppUrl, usePwa } from "../../reminders/pwa";
import { webAppInstallFits } from "./desktopDownload";

/**
 * Two small top-bar controls (docs/APP_LAUNCH.md):
 * - "Open app": only in a browser tab, and only when the browser itself
 *   confirms NGA MIS is installed right now (getInstalledRelatedApps). A real
 *   link -- Chrome sends a clicked link into the installed app's window.
 * - "Install apps": always reachable, to the one-place installer (/apps). A
 *   small still dot says NGA MIS isn't installed here -- only where the web
 *   app is how you install (phones, tablets, Chromebooks). On Windows/macOS
 *   NGA Desktop is the app, so a permanent "not installed" dot there was a
 *   nag nobody could clear.
 */
export const NavAppActions: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const pwa = usePwa();
  const { pathname } = useLocation();
  const showOpen = pwa.inBrowser && pwa.installCheck === "yes";
  const notInstalledHere = pwa.inBrowser && (pwa.installCheck === "no" || pwa.canPrompt) && webAppInstallFits();
  const onInstaller = pathname.startsWith("/apps");

  return (
    <div className="flex items-center gap-1.5">
      {showOpen && (
        <a
          href={openAppUrl()}
          target="_blank"
          rel="noopener"
          title="Open NGA MIS in its app window"
          aria-label="Open the NGA MIS app"
          className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-600 px-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 dark:focus-visible:ring-brand-600/40"
        >
          <AppWindow className="h-4 w-4 transition group-hover:scale-110" />
          {!compact && <span className="hidden lg:inline">Open app</span>}
        </a>
      )}
      {!onInstaller && (
        <Link
          to="/apps"
          title={notInstalledHere ? "Install the NGA apps on this device" : "NGA apps"}
          aria-label={notInstalledHere ? "Install the NGA apps (NGA MIS isn't installed on this device)" : "Install the NGA apps"}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-text-secondary-light transition hover:bg-gray-100 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-text-secondary-dark/80 dark:hover:bg-gray-700/40 dark:hover:text-brand-200"
        >
          <Download className="h-5 w-5" />
          {notInstalledHere && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-slate-900" aria-hidden />
          )}
        </Link>
      )}
    </div>
  );
};

export default NavAppActions;
