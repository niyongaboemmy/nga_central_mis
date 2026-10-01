import { EventEmitter } from "events";

/**
 * Shared runtime bits for the activity engine: an overridable clock (tests drive time
 * with it instead of fake timers, so DB writes stay real) and an in-process event bus
 * that decouples ingest from the watch matcher, SSE fan-out and alerts.
 */
let offsetMs = 0;
let frozen: number | null = null;

export const clock = {
  now: () => (frozen ?? Date.now()) + offsetMs,
  /** Tests: move time forward without waiting. */
  advance: (ms: number) => {
    offsetMs += ms;
  },
  freeze: (at: number | null) => {
    frozen = at;
  },
  reset: () => {
    offsetMs = 0;
    frozen = null;
  },
};

export type ActivitySignal =
  | { type: "session_start"; sessionId: number; userId: number | null; deviceId: string; app: string; at: number; ip: string | null; geoId: number | null; isNewDevice: boolean; isNewIpForUser: boolean; country: string | null; isp: string | null }
  | { type: "page_view"; userId: number | null; deviceId: string; app: string; feature: string | null; route: string | null; at: number; firstInSessionForApp: boolean }
  | { type: "key_event"; userId: number | null; deviceId: string; app: string; name: string; at: number }
  | { type: "presence"; key: string; userId: number | null; deviceId: string; from: string; to: string; at: number; ip: string | null }
  | { type: "auth"; kind: string; outcome: string; userId: number | null; usernameAttempted: string | null; deviceId: string | null; ip: string | null; at: number; reason: string | null }
  | { type: "live_event"; event: Record<string, unknown> };

class ActivityBus extends EventEmitter {
  emitSignal(s: ActivitySignal) {
    try {
      this.emit("signal", s);
    } catch {
      /* a listener's failure must never break ingest */
    }
  }
}
export const activityBus = new ActivityBus();
activityBus.setMaxListeners(50);

/** Kigali is UTC+2 with no DST, so day bucketing is a fixed offset. */
export const TZ_OFFSET_MS = 2 * 60 * 60 * 1000;
export const kigaliDay = (ms: number) => new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
export const kigaliHour = (ms: number) => new Date(ms + TZ_OFFSET_MS).getUTCHours();
