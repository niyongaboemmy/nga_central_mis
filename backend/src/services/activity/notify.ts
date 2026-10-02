import { NotificationKind } from "../../utils/notifications";
import { PushSender, sendWebPush } from "../reminders/webPush";
import { notifyPerson as deliverNotice } from "../notifications/notifyPerson";

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

export const notifyPerson = async (n: MonitorNotice) => deliverNotice(n, sender);
