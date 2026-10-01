import { eq } from "drizzle-orm";
import { db } from "../../db";
import { PushSubscription } from "../../db/reminderSchema";
import { notifyUser, NotificationKind } from "../../utils/notifications";
import logger from "../../utils/logger";
import { appUrl, PushSender, sendWebPush, topicFor } from "../reminders/webPush";

/**
 * Deliver a monitoring notification to one person: always in the app (the bell), and as
 * a Web Push to every device they enabled it on (Reminder Hub subscriptions).
 * Never throws: a delivery failure must not fail the action that triggered it.
 */
let sender: PushSender = sendWebPush;
/** Tests inject a fake push sender. */
export const setMonitorPushSender = (fn: PushSender | null) => {
  sender = fn ?? sendWebPush;
};

export interface MonitorNotice {
  userId: number;
  kind: Extract<NotificationKind, "monitor_watch" | "monitor_alert" | "monitor_message">;
  title: string;
  body?: string;
  link?: string;
  subjectType: "watch" | "alert" | "message";
  subjectId: number;
  actorId?: number;
  push?: boolean;
}

export const notifyPerson = async (n: MonitorNotice) => {
  const delivered: string[] = [];
  try {
    await notifyUser({
      userId: n.userId,
      kind: n.kind,
      title: n.title.slice(0, 255),
      body: n.body?.slice(0, 500),
      link: n.link,
      subjectType: n.subjectType,
      subjectId: n.subjectId,
      actorId: n.actorId,
    });
    delivered.push("in_app");
  } catch (error) {
    logger.error("[activity] in-app notice failed", { error });
  }
  if (n.push === false) return delivered;
  try {
    const subs = await db.select().from(PushSubscription).where(eq(PushSubscription.user_id, n.userId));
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
      const r = await sender(sub, payload, { ttl: 6 * 3600, urgency: "high", topic: topicFor(`${n.kind}:${n.subjectId}`) });
      if (r.ok) ok++;
    }
    if (ok) delivered.push("push");
  } catch (error) {
    logger.error("[activity] push notice failed", { error });
  }
  return delivered;
};
