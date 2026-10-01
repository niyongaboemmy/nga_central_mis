import { invalidateActivityAuth } from "../../middleware/activityAuth";
import { notifyLogout } from "../sso/backchannelLogout";
import { exec, q } from "./db";
import { queueCommand } from "./ingest";
import { notifyPerson } from "./notify";
import { setUserExcludedInCache } from "./people";
import * as presence from "./presence";
import { clock } from "./runtime";
import { endSession, endUserSessions } from "./sessionizer";

/**
 * Controls on a person or device (plan §10.3). Every function here is called by a route
 * that has already checked ANALYTICS_USER_CONTROL, required a reason, and written the
 * monitor access log. The auth events are written by the route (it has the request).
 */

/**
 * Local side of signing someone out (their own logout, or an admin's "sign out
 * everywhere"): drop their live presence, close their open sessions and forget the cached
 * token version, so the collector stops accepting their old token at once.
 */
export const signOutEverywhereLocal = (userId: number) => {
  try {
    presence.dropUser(userId);
    endUserSessions(userId);
    invalidateActivityAuth(userId);
  } catch {
    /* never break a logout */
  }
};

/**
 * Sign out everywhere: bump token_version (every MIS token dies, including the copies the
 * apps hold), back-channel logout to Task Mentor, Tendo and Tupo, and clear presence now.
 */
export const adminSignOutEverywhere = async (userId: number) => {
  await exec("UPDATE User SET token_version = token_version + 1 WHERE user_id = ?", [userId]);
  signOutEverywhereLocal(userId);
  queueCommand({ userId });
  const deliveries = await notifyLogout(userId, { retryDelays: [] }).catch(() => []);
  return { apps: deliveries };
};

/**
 * Sign out one device (best effort): its next sync is told to end the session, and it
 * leaves presence now. "Sign out everywhere" is the guaranteed control.
 */
export const signOutDevice = (deviceId: string) => {
  queueCommand({ deviceId });
  presence.dropDevice(deviceId);
  endSession(deviceId);
};

export const setAccountStatus = async (userId: number, status: "ACTIVE" | "SUSPENDED") => {
  const [u] = await q<any>("SELECT status FROM User WHERE user_id = ?", [userId]);
  if (!u) throw new Error("User not found");
  await exec("UPDATE User SET status = ? WHERE user_id = ?", [status, userId]);
  const out: Record<string, unknown> = { previous: u.status, status };
  if (status === "SUSPENDED") out.signout = await adminSignOutEverywhere(userId);
  return out;
};

export const messageUser = async (userId: number, actorId: number, title: string, body: string) =>
  notifyPerson({
    userId,
    kind: "monitor_message",
    title: title.slice(0, 120) || "Message from the platform administrators",
    body: body.slice(0, 500),
    link: "/me/activity",
    subjectType: "message",
    subjectId: clock.now() % 2_000_000_000,
    actorId,
  });

export const setExcluded = async (userId: number, excluded: boolean) => {
  await exec(
    `INSERT INTO AnalyticsUserState (user_id, excluded) VALUES (?, ?) ON DUPLICATE KEY UPDATE excluded = VALUES(excluded)`,
    [userId, excluded ? 1 : 0],
  );
  setUserExcludedInCache(userId, excluded);
  if (excluded) presence.dropUser(userId);
};
