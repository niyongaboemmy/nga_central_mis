import { invalidateActivityAuth } from "../../middleware/activityAuth";
import * as presence from "./presence";
import { endUserSessions } from "./sessionizer";

/**
 * Local side of signing someone out (their own logout, or an admin's "sign out
 * everywhere"): drop their live presence, close their open sessions and forget the cached
 * token version, so the collector stops accepting their old token at once.
 * The cross-app part (token_version bump + back-channel logout) is done by the caller.
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
