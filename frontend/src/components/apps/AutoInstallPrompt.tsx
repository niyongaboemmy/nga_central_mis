import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, Download, LayoutGrid, X } from "lucide-react";
import Modal from "../ui/Modal";
import { InstallGuide } from "../reminders/InstallGuide";
import {
  autoPromptSnoozed,
  checkInstalledHere,
  clearInstallRequest,
  hideInstallButton,
  installButtonHidden,
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
 * Opens the install sheet automatically when MIS loads in a browser tab and
 * isn't installed on this device (docs/APP_LAUNCH.md). The browser's own
 * install dialog still needs one click (a gesture) -- the sheet's button.
 * "Not now" hides it until the browser is reopened, and a corner Install
 * button stays available, so nobody is ever left without a way to install.
 * The NGA installer (`nga_install=1`) always asks.
 */
export const AutoInstallPrompt: React.FC = () => {
  const pwa = usePwa();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [closedThisLoad, setClosedThisLoad] = useState(false);
  const [buttonHidden, setButtonHidden] = useState(() => installButtonHidden());
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
    checkInstalledHere().then((installedHere) => {
      if (alive && !installedHere) {
        markLaunchInstallAsked();
        setOpen(true);
      }
    });
    return () => {
      alive = false;
    };
    // Once per app load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pwa.installed && open && !returnUrl) setOpen(false);
  }, [pwa.installed, open, returnUrl]);

  // The browser's "installable, not installed" signal (beforeinstallprompt)
  // often arrives after the first render: open then too.
  useEffect(() => {
    if (!pwa.canPrompt || open || closedThisLoad) return;
    const ok = shouldAutoOffer({
      installed: false,
      installMethod: pwa.platform.installMethod,
      forced: installRequested() || shouldAskInstallFromLaunch(),
      snoozed: autoPromptSnoozed(),
      onInstallerPage: location.pathname.startsWith("/apps"),
    });
    if (ok) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwa.canPrompt]);

  const close = () => {
    if (!installRequested()) snoozeAutoPrompt();
    clearInstallRequest();
    setClosedThisLoad(true);
    setOpen(false);
  };

  const showButton = shouldShowInstallButton({
    installed: pwa.installed && !pwa.canPrompt,
    canPrompt: pwa.canPrompt,
    installMethod: pwa.platform.installMethod,
    sheetOpen: open,
    hidden: buttonHidden,
    onInstallerPage: location.pathname.startsWith("/apps"),
  });

  return (
    <>
    {showButton && (
      <div className="fixed bottom-4 left-4 z-40 flex items-center gap-0.5 rounded-full bg-brand-600 p-1 text-white shadow-float" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Download className="h-4 w-4" /> Install NGA MIS
        </button>
        <button
          type="button"
          aria-label="Hide the install button"
          onClick={() => {
            hideInstallButton();
            setButtonHidden(true);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )}
    <Modal isOpen={open} onClose={close} title={pwa.installed ? "NGA MIS is installed" : "Install NGA MIS as an app"} size="md">
      <div className="space-y-4">
        <InstallGuide />
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
