import { describe, it, expect } from "vitest";
import type { AgendaItem } from "../../../api/reminders";
import { computeNowNext, formatCountdown, formatOffset, kigaliClock } from "../agendaUtils";
import { chooseNudge } from "../ReminderNudge";

// Kigali is UTC+2: 10:20 Kigali = 08:20Z.
const item = (key: string, start: string, end: string | null, kind: AgendaItem["kind"] = "lesson"): AgendaItem => ({
  key,
  kind,
  title: key,
  detail: null,
  location: null,
  link: null,
  color: null,
  role: "attending",
  critical: false,
  start,
  end,
});

const DAY = [
  item("Maths", "2026-09-30T06:00:00Z", "2026-09-30T06:50:00Z"),
  item("Physics", "2026-09-30T08:20:00Z", "2026-09-30T09:10:00Z"),
  item("Essay due", "2026-09-30T15:00:00Z", null, "assignment_due"),
  item("Chemistry", "2026-10-01T06:00:00Z", "2026-10-01T06:50:00Z"),
];

describe("computeNowNext", () => {
  it("finds the current lesson, its progress, and what's next", () => {
    const s = computeNowNext(DAY, new Date("2026-09-30T06:25:00Z"));
    expect(s.current?.title).toBe("Maths");
    expect(s.progress).toBeCloseTo(0.5, 1);
    expect(s.next?.title).toBe("Physics");
    expect(s.untilNext).toBe(115 * 60_000);
    expect(s.laterToday.map((i) => i.title)).toEqual(["Essay due"]);
  });

  it("is free between lessons and counts what's done", () => {
    const s = computeNowNext(DAY, new Date("2026-09-30T07:30:00Z"));
    expect(s.current).toBeNull();
    expect(s.next?.title).toBe("Physics");
    expect(s.doneToday).toBe(1);
  });

  it("never treats a deadline as something happening now", () => {
    const s = computeNowNext(DAY, new Date("2026-09-30T15:10:00Z"));
    expect(s.current).toBeNull();
    expect(s.next?.title).toBe("Chemistry");
    expect(s.laterToday).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats countdowns and offsets for people", () => {
    expect(formatCountdown(10_000)).toBe("now");
    expect(formatCountdown(4 * 60_000)).toBe("in 4 min");
    expect(formatCountdown(80 * 60_000)).toBe("in 1 h 20 min");
    expect(formatCountdown(2 * 86_400_000)).toBe("in 2 days");
    expect(formatOffset(10)).toBe("10 min");
    expect(formatOffset(90)).toBe("1 h 30 min");
    expect(formatOffset(1440)).toBe("1 day");
  });

  it("shows Kigali time whatever the device zone", () => {
    expect(kigaliClock("2026-09-30T08:20:00Z")).toBe("10:20");
    expect(kigaliClock("2026-09-30T22:05:00Z")).toBe("00:05");
  });
});

describe("chooseNudge", () => {
  const base = {
    remindersOn: false,
    pushStatus: "off" as const,
    installed: false,
    installMethod: "prompt",
    visits: 2,
    installSnoozed: false,
    reminderNudgeSnoozed: false,
    onRemindersPage: false,
  };

  it("says nothing until it knows the state, and never on the reminders page", () => {
    expect(chooseNudge({ ...base, remindersOn: null })).toBeNull();
    expect(chooseNudge({ ...base, onRemindersPage: true })).toBeNull();
  });

  it("puts a blocked permission first", () => {
    expect(chooseNudge({ ...base, remindersOn: true, pushStatus: "blocked" })).toBe("blocked");
  });

  it("asks a second device to join when reminders are on elsewhere", () => {
    expect(chooseNudge({ ...base, remindersOn: true, pushStatus: "off", installed: true })).toBe("enable-device");
  });

  it("offers install from the second visit, not the first, and respects the snooze", () => {
    expect(chooseNudge({ ...base, visits: 1 })).toBeNull();
    expect(chooseNudge(base)).toBe("install");
    expect(chooseNudge({ ...base, installSnoozed: true })).toBeNull();
    expect(chooseNudge({ ...base, installMethod: "none", visits: 3 })).toBe("try-reminders");
  });
});
