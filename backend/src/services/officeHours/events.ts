import logger from "../../utils/logger";

/**
 * Domain events raised by the office-hours services. The services stay free of
 * delivery concerns; the notifier (notify.ts) subscribes and turns each event
 * into bell / push / email / Reminder Hub work after the response.
 *
 * Handlers run on setImmediate and never fail the request. Tests await
 * flushOfficeHoursEvents() and can inspect recentOfficeHoursEvents().
 */
export type OfficeHoursEvent =
  | { type: "assigned"; scheduleId: number; assignmentIds: number[]; actorId: number }
  | { type: "removed"; assignmentId: number; actorId: number; reason: string }
  | { type: "override"; assignmentId: number; endedAssignmentIds: number[]; actorId: number }
  | { type: "schedule_published"; scheduleId: number; actorId: number }
  | { type: "schedule_changed"; scheduleId: number; actorId: number; fields: string[] }
  | { type: "schedule_ended"; scheduleId: number; actorId: number }
  | { type: "sessions_cancelled"; sessionIds: number[]; actorId: number; reason: string }
  | { type: "sessions_restored"; sessionIds: number[]; actorId: number }
  | { type: "host_changed"; sessionId: number; previousHostId: number; actorId: number }
  | { type: "register_saved"; sessionId: number; actorId: number; changedStudentIds: number[] }
  | { type: "transfer_requested"; requestId: number; actorId: number }
  | { type: "transfer_decided"; requestId: number; actorId: number; accepted: boolean }
  | { type: "absence_notice"; sessionId: number; studentId: number };

type Handler = (event: OfficeHoursEvent) => Promise<void>;

const handlers: Handler[] = [];
const pending = new Set<Promise<void>>();
const recent: OfficeHoursEvent[] = [];

export const onOfficeHoursEvent = (handler: Handler) => {
  handlers.push(handler);
};

export const emitOfficeHoursEvent = (event: OfficeHoursEvent) => {
  recent.push(event);
  if (recent.length > 200) recent.shift();
  for (const handler of handlers) {
    const task = new Promise<void>((resolve) => {
      setImmediate(() => {
        handler(event)
          .catch((error) => logger.error(`[office-hours] ${event.type} handler failed`, { error }))
          .finally(resolve);
      });
    });
    pending.add(task);
    task.finally(() => pending.delete(task));
  }
};

/** Test hook: wait for every handler (and any events they emit) to finish. */
export const flushOfficeHoursEvents = async () => {
  for (let guard = 0; guard < 20 && pending.size > 0; guard++) {
    await Promise.all([...pending]);
  }
};

export const recentOfficeHoursEvents = () => [...recent];
export const clearOfficeHoursEvents = () => {
  recent.length = 0;
};
