/**
 * "Get the apps" opens over the current page (AppsDialog, mounted by SystemLayout)
 * instead of leaving the signed-in app for the standalone /apps page. That page stays
 * for setting up a device before anyone signs in, and is the fallback here: when no
 * dialog is mounted to take the request, the caller navigates there instead.
 */
export const OPEN_APPS_EVENT = "nga:open-apps";

/** Asks the mounted AppsDialog to open. False when nothing handled it. */
export const requestAppsDialog = (): boolean =>
  !window.dispatchEvent(new CustomEvent(OPEN_APPS_EVENT, { cancelable: true }));
