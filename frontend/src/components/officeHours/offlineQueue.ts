import { officeHoursApi, type RegisterRecordInput } from "../../api/officeHours";

/**
 * Offline register queue (plan §12.3). A register saved without a connection
 * is kept on this device and sent when the browser is back online. A queued
 * save that clashes with a newer one on the server is kept (not forced) so the
 * teacher can reopen the register and decide.
 */
const KEY = "nga.oh.registerQueue";

export interface QueuedRegister {
  sessionId: number;
  body: { records: RegisterRecordInput[]; topic?: string | null; version?: number };
  queuedAt: string;
  conflict?: boolean;
}

const read = (): QueuedRegister[] => {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const write = (items: QueuedRegister[]) => {
  try {
    if (items.length) window.localStorage.setItem(KEY, JSON.stringify(items));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: nothing more we can do */
  }
};

export const pendingRegisters = () => read();

export const queueRegister = async (sessionId: number, body: QueuedRegister["body"]) => {
  // One pending save per session: the newest replaces an older one.
  const items = read().filter((i) => i.sessionId !== sessionId);
  items.push({ sessionId, body, queuedAt: new Date().toISOString() });
  write(items);
};

/** Send everything queued. Returns how many were sent and how many clashed. */
export const flushRegisterQueue = async () => {
  const items = read();
  if (!items.length) return { sent: 0, conflicts: 0 };
  const keep: QueuedRegister[] = [];
  let sent = 0;
  let conflicts = 0;
  for (const item of items) {
    if (item.conflict) {
      keep.push(item);
      conflicts++;
      continue;
    }
    try {
      await officeHoursApi.saveRegister(item.sessionId, item.body);
      sent++;
    } catch (error: any) {
      if (!error?.response) keep.push(item); // still offline
      else if (error.response.status === 409) {
        keep.push({ ...item, conflict: true });
        conflicts++;
      }
      // Any other refusal (window closed, cancelled) cannot succeed later: drop it.
    }
  }
  write(keep);
  return { sent, conflicts };
};

export const discardQueued = (sessionId: number) => write(read().filter((i) => i.sessionId !== sessionId));

/** Flush now and whenever the browser comes back online. Returns an unsubscribe function. */
export const startRegisterQueueFlusher = (onResult?: (r: { sent: number; conflicts: number }) => void) => {
  const run = () => {
    if (navigator.onLine === false) return;
    void flushRegisterQueue().then((r) => {
      if (r.sent || r.conflicts) onResult?.(r);
    });
  };
  run();
  window.addEventListener("online", run);
  return () => window.removeEventListener("online", run);
};
