import { eq } from "drizzle-orm";
import { db } from "../../db";
import { PushSubscription } from "../../db/reminderSchema";
import { notifyUser, NotifyUserInput } from "../../utils/notifications";
import logger from "../../utils/logger";
import { appUrl, PushSender, sendWebPush, topicFor } from "../reminders/webPush";

/**
 * Deliver one notice to one person: always in the app (the bell), and as a
 * Web Push to every device they enabled it on (Reminder Hub subscriptions).
 * Unlike scheduled reminders this does not depend on the person having
 * switched reminders on -- it is for things they must know (an assignment, a
 * cancellation). Never throws: a delivery failure must not fail the action.
 */
let defaultSender: PushSender = sendWebPush;
/** Tests inject a fake push sender. */
export const setNoticePushSender = (fn: PushSender | null) => {
  defaultSender = fn ?? sendWebPush;
};

export type PersonNotice = NotifyUserInput & { push?: boolean; ttlSeconds?: number };

export const notifyPerson = async (n: PersonNotice, sender: PushSender = defaultSender) => {
  const delivered: string[] = [];
  try {
    await notifyUser({ ...n, title: n.title.slice(0, 255), body: n.body?.slice(0, 500) });
    delivered.push("in_app");
  } catch (error) {
    logger.error("[notice] in-app notice failed", { error });
  }
  if (n.push === false) return delivered;
  try {
    const subs = await db.select().from(PushSubscription).where(eq(PushSubscription.user_id, n.userId));
    if (!subs.length) return delivered;
    const url = appUrl(n.link ?? "/");
    const payload = JSON.stringify({
      web_push: 8030,
      notification: {
        title: n.title.slice(0, 120),
        body: (n.body ?? "").slice(0, 240),
        navigate: url,
        lang: "en",
        dir: "ltr",
        tag: topicFor(`${n.kind}:${n.subjectType}:${n.subjectId}`),
        silent: false,
        data: { kind: n.kind, url },
      },
    });
    let ok = 0;
    for (const sub of subs) {
      const r = await sender(sub, payload, { ttl: n.ttlSeconds ?? 6 * 3600, urgency: "high", topic: topicFor(`${n.kind}:${n.subjectId}`) });
      if (r.ok) ok++;
    }
    if (ok) delivered.push("push");
  } catch (error) {
    logger.error("[notice] push notice failed", { error });
  }
  return delivered;
};
