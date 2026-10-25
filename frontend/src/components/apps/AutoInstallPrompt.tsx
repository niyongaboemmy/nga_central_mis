import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, Download, LayoutGrid, X } from "lucide-react";
import Modal from "../ui/Modal";
import { InstallGuide } from "../reminders/InstallGuide";
import OpenInAppGuide from "./OpenInAppGuide";
import { getToken } from "../../utils/auth";
import {
  autoPromptSnoozed,
  checkInstalledHere,
  clearInstallRequest,
  installRequested,
  installReturnUrl,
  markLaunchInstallAsked,
  shouldAskInstallFromLaunch,
  snoozeAutoPrompt,
  usePwa,
} from "../../reminders/pwa";

/** Pure decision (unit-tested): open the install sheet on this load? */
export const shouldAutoOffer = (s: {
  installed: boolean;
  installMethod: string;
  forced: boolean;
  snoozed: boolean;
  onInstallerPage: boolean;
}) => {
  if (s.installed || s.onInstallerPage) return false;
  if (s.installMethod === "none") return false; // this browser can't install web apps
  return s.forced || !s.snoozed;
};

/**
 * Pure decision (unit-tested): show the small always-available Install
 * button? On Chromium only when the browser says MIS is installable
 * (beforeinstallprompt) -- so never for an installed app. iPhone/iPad,
 * Safari on Mac and Firefox on Windows have no such signal: shown unless
 * running installed.
 */
export const shouldShowInstallButton = (s: {
  installed: boolean;
  canPrompt: boolean;
  installMethod: string;
  sheetOpen: boolean;
  hidden: boolean;
  onInstallerPage: boolean;
}) => {
  if (s.installed || s.sheetOpen || s.hidden || s.onInstallerPage) return false;
  if (s.canPrompt) return true;
  return s.installMethod === "ios" || s.installMethod === "mac-dock" || s.installMethod === "firefox-taskbar";
};

/**
 * Offers to install MIS when it loads in a browser tab and isn't installed on
 * this device (docs/APP_LAUNCH.md) -- quietly. An ordinary visit gets a small
 * bar at the foot of the screen for a signed-in user, never a blocking sheet;
 * its Install button opens the full guide (the browser's own install dialog
 * still needs that click as a gesture). "Not now" or the bar's x keeps the
 * offer away for AUTO_DISMISS_DAYS, and the top-bar Install control stays
 * available, so nobody is left without a way to install. Only an explicit ask
 * (the NGA installer's `nga_install=1`, an app launch marker) opens the sheet
 * straight away, and it ignores "Not now".
 */
export const AutoInstallPrompt: React.FC = () => {
  const pwa = usePwa();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [closedThisLoad, setClosedThisLoad] = useState(false);
  const returnUrl = installReturnUrl();

  useEffect(() => {
    let alive = true;
    const forced = installRequested() || shouldAskInstallFromLaunch();
    const decide = shouldAutoOffer({
      installed: pwa.installed,
      installMethod: pwa.platform.installMethod,
      forced,
      snoozed: autoPromptSnoozed(),
      onInstallerPage: location.pathname.startsWith("/apps"),
    });
    if (!decide) return;
    if (!forced && !getToken()) return; // not on the sign-in page
    checkInstalledHere().then((installedHere) => {
      if (!alive || installedHere) return;
      if (forced) {
        markLaunchInstallAsked();
        setOpen(true);
      } else {
        setBarOpen(true);
      }
    });
    return () => {
      alive = false;
    };
    // Once per app load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pwa.installed) setBarOpen(false);
    if (pwa.installed && !pwa.linksOpenInBrowser && open && !returnUrl) setOpen(false);
  }, [pwa.installed, pwa.linksOpenInBrowser, open, returnUrl]);

  // "Open app" landed in this tab although MIS is installed: Chrome opens its
  // links in the browser. Explain the one switch that fixes it.
  useEffect(() => {
    if (pwa.installed && pwa.linksOpenInBrowser && installRequested() && !open && !closedThisLoad) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwa.installed, pwa.linksOpenInBrowser]);

  // The browser's "installable, not installed" signal (beforeinstallprompt)
  // often arrives after the first render: open then too.
  useEffect(() => {
    if (!pwa.canPrompt || open || barOpen || closedThisLoad) return;
    const forced = installRequested() || shouldAskInstallFromLaunch();
    const ok = shouldAutoOffer({
      installed: false,
      installMethod: pwa.platform.installMethod,
      forced,
      snoozed: autoPromptSnoozed(),
      onInstallerPage: location.pathname.startsWith("/apps"),
    });
    if (!ok) return;
    if (forced) setOpen(true);
    else if (getToken()) setBarOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwa.canPrompt]);

  const close = () => {
    if (!installRequested()) snoozeAutoPrompt();
    clearInstallRequest();
    setClosedThisLoad(true);
    setOpen(false);
    setBarOpen(false);
  };


  return (
    <>
    {/* The install/open controls live in the top bar (NavAppActions):
        floating pills covered the sidebar. The bar below is the one quiet
        offer, shown only where this component mounts (phones, tablets,
        Chromebooks -- see webAppInstallFits), so it covers no sidebar. */}
    {barOpen && !open && (
      <div
        role="region"
        aria-label="Install NGA MIS"
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 py-2 pl-3 pr-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      >
        <Download className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">Install NGA MIS for quicker access</p>
        <button
          type="button"
          onClick={() => {
            setBarOpen(false);
            setOpen(true);
          }}
          className="rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          Install
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Not now"
          title="Not now"
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )}
    <Modal
      isOpen={open}
      onClose={close}
      title={pwa.installed && pwa.linksOpenInBrowser ? "Open NGA MIS as an app" : pwa.installed ? "NGA MIS is installed" : "Install NGA MIS as an app"}
      size="md"
    >
      <div className="space-y-4">
        {pwa.installed && pwa.linksOpenInBrowser ? <OpenInAppGuide /> : <InstallGuide />}
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          {returnUrl ? (
            <a href={returnUrl} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-200">
              <ArrowLeft className="h-4 w-4" /> Back to the NGA installer
            </a>
          ) : (
            <a href="/apps" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-200">
              <LayoutGrid className="h-4 w-4" /> Install all NGA apps
            </a>
          )}
          <button
            type="button"
            onClick={close}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {pwa.installed ? "Close" : "Not now"}
          </button>
        </div>
      </div>
    </Modal>
    </>
  );
};
