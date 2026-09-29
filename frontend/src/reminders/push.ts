import { remindersApi } from "../api/reminders";
import { getPwaState, readyRegistration } from "./pwa";

/**
 * Web Push on this device (REMINDERS_SOLUTION_PROPOSAL.md §6.1, §7.3-7.5).
 * Permission is only ever requested from a user gesture (enablePush), never
 * on load, and every app open runs a silent health check.
 */

export type PushStatus =
  | "unsupported" // no service worker / Push API here
  | "needs-install" // iOS/iPadOS: install to the Home Screen first
  | "blocked" // the user (or Chrome's auto-revocation) blocked notifications
  | "off" // allowed or never asked, but this device isn't subscribed
  | "on"; // subscribed and known to the server

export const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const permission = (): NotificationPermission | "unsupported" =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

export const currentSubscription = async (): Promise<PushSubscription | null> => {
  const { platform } = getPwaState();
  if (!platform.pushCapable) return null;
  const reg = await readyRegistration();
  if (!reg?.pushManager) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
};

export const getPushStatus = async (): Promise<PushStatus> => {
  const { platform } = getPwaState();
  if (platform.pushNeedsInstall && !platform.pushCapable) {
    return typeof window !== "undefined" && "serviceWorker" in navigator ? "needs-install" : "unsupported";
  }
  if (!platform.pushCapable) return "unsupported";
  if (permission() === "denied") return "blocked";
  const sub = await currentSubscription();
  return sub && permission() === "granted" ? "on" : "off";
};

const sendToServer = async (sub: PushSubscription) => {
  const { platform, installed } = getPwaState();
  await remindersApi.subscribe({
    subscription: sub.toJSON(),
    platform: platform.os,
    browser: platform.browser,
    installed,
  });
};

export type EnableResult = "on" | "blocked" | "dismissed" | "unsupported" | "needs-install" | "no-key" | "private";

/** The "Turn on reminders" button. Must run inside a click handler. */
export const enablePush = async (): Promise<EnableResult> => {
  const { platform } = getPwaState();
  if (platform.pushNeedsInstall && !platform.pushCapable) return "needs-install";
  if (!platform.pushCapable) return "unsupported";

  const result = await Notification.requestPermission();
  if (result === "denied") return "blocked";
  if (result !== "granted") return "dismissed";

  const config = await remindersApi.config();
  if (!config.push.enabled || !config.push.publicKey) return "no-key";
  const reg = await readyRegistration();
  if (!reg) return "unsupported";

  const key = urlBase64ToUint8Array(config.push.publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server key can't be reused.
  if (sub) {
    const existing = sub.options?.applicationServerKey;
    const same =
      existing &&
      new Uint8Array(existing as ArrayBuffer).length === key.length &&
      new Uint8Array(existing as ArrayBuffer).every((b, i) => b === key[i]);
    if (!same) {
      await sub.unsubscribe().catch(() => undefined);
      sub = null;
    }
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
    } catch (error: any) {
      // Chrome refuses push in incognito, deliberately undetectable up front.
      if (/incognito|private/i.test(String(error?.message))) return "private";
      throw error;
    }
  }
  await sendToServer(sub);
  return "on";
};

export const disablePush = async () => {
  const sub = await currentSubscription();
  if (!sub) return;
  await remindersApi.unsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
};

/**
 * Silent check on every app open: if the browser still has a subscription
 * but the server forgot it (removed after failures, other user signed in
 * here...), register it again; if the browser lost it while permission is
 * still granted (pushsubscriptionchange), make a new one.
 */
export const pushHealthCheck = async (serverWantsReminders: boolean): Promise<PushStatus> => {
  const status = await getPushStatus();
  if (status === "on") {
    const sub = await currentSubscription();
    if (sub) {
      const { known } = await remindersApi.heartbeat(sub.endpoint, getPwaState().installed).catch(() => ({ known: true }));
      if (!known) await sendToServer(sub).catch(() => undefined);
    }
    return "on";
  }
  if (status === "off" && serverWantsReminders && permission() === "granted") {
    try {
      return (await enablePush()) === "on" ? "on" : "off";
    } catch {
      return "off";
    }
  }
  return status;
};
