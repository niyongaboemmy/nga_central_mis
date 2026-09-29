import React, { useState } from "react";
import {
  AppWindow,
  CheckCircle2,
  Download,
  EllipsisVertical,
  MonitorSmartphone,
  PanelBottom,
  PlusSquare,
  Share,
  Smartphone,
  ToggleRight,
} from "lucide-react";
import Modal from "../ui/Modal";
import { promptInstall, refreshPwa, snoozeInstallPrompt, usePwa } from "../../reminders/pwa";
import { BROWSER_LABEL, OS_LABEL } from "../../reminders/platform";

interface Step {
  icon: React.ReactNode;
  text: React.ReactNode;
}

const StepList: React.FC<{ steps: Step[] }> = ({ steps }) => (
  <ol className="space-y-3">
    {steps.map((step, i) => (
      <li key={i} className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-600/20 dark:text-brand-200">
          {step.icon}
        </span>
        <div className="pt-1.5 text-sm text-slate-700 dark:text-slate-200">
          <span className="mr-1.5 font-semibold text-slate-900 dark:text-white">{i + 1}.</span>
          {step.text}
        </div>
      </li>
    ))}
  </ol>
);

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
    {children}
  </span>
);

/**
 * How to install the NGA app on *this* device (REMINDERS_SOLUTION_PROPOSAL.md
 * §7.2): the browser's own dialog where one exists, illustrated steps where
 * the platform only allows a manual install (iOS, Safari on Mac, Firefox).
 */
export const InstallGuide: React.FC<{ onDone?: () => void; compact?: boolean }> = ({ onDone, compact }) => {
  const pwa = usePwa();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { platform } = pwa;

  if (pwa.installed) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-success-100/70 p-4 text-success-700 dark:bg-success-500/10 dark:text-success-100">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm font-medium">The NGA app is installed on this {OS_LABEL[platform.os]}.</p>
      </div>
    );
  }

  const install = async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        setResult("Installed! Open NGA from your home screen or app list.");
        onDone?.();
      } else if (outcome === "dismissed") {
        setResult("No problem — we'll ask again in two weeks.");
      } else {
        setResult("Your browser isn't ready to install yet. Use the steps below.");
      }
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  switch (platform.installMethod) {
    case "prompt":
      body = (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Install NGA as an app: it opens in its own window, starts faster, and reminders keep arriving when the
            browser is closed{platform.os === "android" ? " — even with the phone locked" : ""}.
          </p>
          <button
            type="button"
            onClick={install}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            {busy ? "Opening…" : "Install the NGA app"}
          </button>
        </div>
      );
      break;
    case "ios":
      body = (
        <StepList
          steps={[
            {
              icon: <Share className="h-4 w-4" />,
              text: (
                <>
                  Tap <Kbd>Share <Share className="h-3 w-3" /></Kbd> in {platform.browser === "safari" ? "Safari's toolbar" : "the browser menu"}.
                </>
              ),
            },
            {
              icon: <PlusSquare className="h-4 w-4" />,
              text: (
                <>
                  Scroll and choose <Kbd>Add to Home Screen</Kbd>.
                </>
              ),
            },
            {
              icon: <ToggleRight className="h-4 w-4" />,
              text: (
                <>
                  Keep <Kbd>Open as Web App</Kbd> switched <strong>on</strong>, then tap <Kbd>Add</Kbd>.
                </>
              ),
            },
            {
              icon: <Smartphone className="h-4 w-4" />,
              text: (
                <>
                  Open <strong>NGA</strong> from your Home Screen and turn on reminders there — iPhone only allows
                  notifications for installed apps.
                </>
              ),
            },
          ]}
        />
      );
      break;
    case "mac-dock":
      body = (
        <StepList
          steps={[
            { icon: <AppWindow className="h-4 w-4" />, text: <>In Safari's menu bar choose <Kbd>File</Kbd> → <Kbd>Add to Dock…</Kbd></> },
            { icon: <PlusSquare className="h-4 w-4" />, text: <>Keep the name <strong>NGA</strong> and click <Kbd>Add</Kbd>.</> },
            { icon: <MonitorSmartphone className="h-4 w-4" />, text: <>Open NGA from the Dock and turn on reminders there.</> },
          ]}
        />
      );
      break;
    case "firefox-taskbar":
      body = (
        <StepList
          steps={[
            { icon: <PanelBottom className="h-4 w-4" />, text: <>Click the <Kbd>Add to taskbar</Kbd> icon at the right of Firefox's address bar.</> },
            { icon: <MonitorSmartphone className="h-4 w-4" />, text: <>Open NGA from the taskbar. Keep Firefox running in the background to receive reminders.</> },
          ]}
        />
      );
      break;
    case "manual":
      body = (
        <StepList
          steps={[
            {
              icon: <EllipsisVertical className="h-4 w-4" />,
              text: <>Open the {BROWSER_LABEL[platform.browser]} menu <Kbd><EllipsisVertical className="h-3 w-3" /></Kbd>.</>,
            },
            {
              icon: <Download className="h-4 w-4" />,
              text: (
                <>
                  Choose <Kbd>Install app</Kbd> or <Kbd>Add to Home screen</Kbd>.
                </>
              ),
            },
          ]}
        />
      );
      break;
    default:
      body = (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {BROWSER_LABEL[platform.browser]} on {OS_LABEL[platform.os]} can't install web apps. Reminders still work in
          this browser while it's open — or open NGA in Chrome or Edge to install it, or add your timetable to your
          calendar app below.
        </p>
      );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {body}
      {result && <p className="text-sm font-medium text-brand-700 dark:text-brand-200" role="status">{result}</p>}
      {platform.installMethod !== "prompt" && platform.installMethod !== "none" && (
        <button
          type="button"
          onClick={() => {
            refreshPwa();
            onDone?.();
          }}
          className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-200"
        >
          I've installed it
        </button>
      )}
    </div>
  );
};

export const InstallSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal
    isOpen={isOpen}
    onClose={() => {
      snoozeInstallPrompt();
      onClose();
    }}
    title="Install the NGA app"
    size="md"
  >
    <InstallGuide onDone={onClose} />
  </Modal>
);
