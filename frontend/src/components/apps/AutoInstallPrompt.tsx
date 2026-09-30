import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import Modal from "../ui/Modal";
import { InstallGuide } from "../reminders/InstallGuide";
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
 * Opens the install sheet automatically when MIS loads in a browser tab and
 * isn't installed on this device (docs/APP_LAUNCH.md). The browser's own
 * install dialog still needs one click (a gesture) -- the sheet's button.
 * "Not now" waits a day; the NGA installer (`nga_install=1`) always asks.
 */
export const AutoInstallPrompt: React.FC = () => {
  const pwa = usePwa();
  const location = useLocation();
  const [open, setOpen] = useState(false);
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

  return (
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
  );
};
