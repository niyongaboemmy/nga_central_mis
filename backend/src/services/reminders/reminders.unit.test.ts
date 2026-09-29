import { describe, it, expect } from "vitest";
import {
  addDaysYmd,
  describeLead,
  dowOfYmd,
  inQuietWindow,
  kigaliDatesBetween,
  kigaliInstant,
  kigaliParts,
  parseClock,
  shiftOutOfQuiet,
} from "./time";
import { DEFAULT_PREFERENCES, normalizeSettings, type ReminderPreferences } from "./preferences";
import { planJobs } from "./expander";
import type { Occurrence } from "./occurrences";
import { buildIcs, foldLine } from "./calendarFeed";
import { signAction, topicFor, verifyAction } from "./webPush";
import { describeJob } from "./dispatcher";
import { isAllowedPushEndpoint } from "../../controllers/reminderController";

// Wednesday 30 Sep 2026, 08:00 in Kigali (UTC+2) = 06:00 UTC.
const WED_0800 = new Date("2026-09-30T06:00:00Z");

const occ = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  key: "lesson:1:2026-09-30",
  kind: "lesson",
  sourceRef: "slot:1",
  title: "Physics",
  detail: "S4 MPC · Lab 2",
  link: "/dashboard",
  location: "Lab 2",
  start: kigaliInstant("2026-09-30", 10 * 60 + 20),
  end: kigaliInstant("2026-09-30", 11 * 60 + 10),
  critical: false,
  color: "#3b82f6",
  role: "attending",
  ...overrides,
});

const prefs = (overrides: Partial<ReminderPreferences> = {}): ReminderPreferences => ({
  ...DEFAULT_PREFERENCES,
  enabled: true,
  settings: normalizeSettings(null),
  ...overrides,
});

describe("Kigali time helpers", () => {
  it("derives the Kigali calendar day from a UTC instant", () => {
    // 22:30 UTC is already 00:30 the next day in Kigali.
    const p = kigaliParts(new Date("2026-09-29T22:30:00Z"));
    expect(p.ymd).toBe("2026-09-30");
    expect(p.dow).toBe(3);
    expect(p.minutes).toBe(30);
  });

  it("turns a Kigali date + wall-clock into the right UTC instant", () => {
    expect(kigaliInstant("2026-09-30", 8 * 60).toISOString()).toBe("2026-09-30T06:00:00.000Z");
    expect(kigaliInstant("2026-09-30", 0).toISOString()).toBe("2026-09-29T22:00:00.000Z");
  });

  it("parses timetable clock strings", () => {
    expect(parseClock("08:00")).toBe(480);
    expect(parseClock("8:05:00")).toBe(485);
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("noon")).toBeNull();
    expect(parseClock(null)).toBeNull();
  });

  it("walks dates across month ends and knows weekdays", () => {
    expect(addDaysYmd("2026-09-30", 1)).toBe("2026-10-01");
    expect(dowOfYmd("2026-10-04")).toBe(0);
    expect(kigaliDatesBetween(WED_0800, new Date("2026-10-02T06:00:00Z"))).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("handles quiet windows that wrap midnight", () => {
    expect(inQuietWindow(22 * 60, 21 * 60, 6 * 60)).toBe(true);
    expect(inQuietWindow(5 * 60, 21 * 60, 6 * 60)).toBe(true);
    expect(inQuietWindow(12 * 60, 21 * 60, 6 * 60)).toBe(false);
    expect(inQuietWindow(12 * 60, 6 * 60, 6 * 60)).toBe(false);
  });

  it("moves a quiet-hours reminder to the morning, or drops it if that is too late", () => {
    const event = kigaliInstant("2026-10-01", 17 * 60);
    const fire = kigaliInstant("2026-09-30", 23 * 60);
    expect(shiftOutOfQuiet(fire, event, 21 * 60, 6 * 60)?.toISOString()).toBe(
      kigaliInstant("2026-10-01", 6 * 60).toISOString(),
    );
    const earlyEvent = kigaliInstant("2026-10-01", 5 * 60);
    expect(shiftOutOfQuiet(fire, earlyEvent, 21 * 60, 6 * 60)).toBeNull();
  });

  it("describes the lead time in plain words", () => {
    expect(describeLead(kigaliInstant("2026-09-30", 8 * 60 + 10), WED_0800)).toBe("in 10 min");
    expect(describeLead(kigaliInstant("2026-09-30", 10 * 60 + 5), WED_0800)).toBe("in 2 h 5 min");
    expect(describeLead(kigaliInstant("2026-10-01", 8 * 60), WED_0800)).toBe("tomorrow at 08:00");
  });
});

describe("Reminder preferences", () => {
  it("fills defaults and filters bad offsets", () => {
    const s = normalizeSettings({
      lesson: { enabled: false, offsets: [5, 5, "x", -1, 99999, 30, 10, 20] },
      nonsense: { enabled: true },
    });
    expect(s.lesson).toEqual({ enabled: false, offsets: [30, 20, 10] });
    expect(s.quiz_close.offsets).toEqual([60, 15]);
    expect((s as any).nonsense).toBeUndefined();
  });
});

describe("planJobs", () => {
  it("plans a student lesson 10 minutes ahead and a teacher's 15", () => {
    const jobs = planJobs(
      [occ(), occ({ key: "lesson:2:2026-09-30", role: "teaching" })],
      prefs({ morningBriefing: false }),
      WED_0800,
      new Date(WED_0800.getTime() + 36 * 3_600_000),
    );
    const byKey = Object.fromEntries(jobs.map((j) => [j.dedupeKey, j]));
    expect(byKey["lesson:1:2026-09-30:10"].fireAt.toISOString()).toBe(kigaliInstant("2026-09-30", 10 * 60 + 10).toISOString());
    expect(byKey["lesson:2:2026-09-30:15"]).toBeDefined();
  });

  it("respects the user's explicit lesson offsets for teachers too", () => {
    const jobs = planJobs(
      [occ({ role: "teaching" })],
      prefs({ morningBriefing: false }),
      WED_0800,
      new Date(WED_0800.getTime() + 36 * 3_600_000),
      { explicitLessonOffsets: true },
    );
    expect(jobs.map((j) => j.offsetMin)).toEqual([10]);
  });

  it("skips disabled kinds, past reminders and started events", () => {
    const p = prefs({ morningBriefing: false });
    p.settings.activity.enabled = false;
    const jobs = planJobs(
      [
        occ({ kind: "activity", key: "activity:1:2026-09-30" }),
        occ({ key: "lesson:3:2026-09-30", start: kigaliInstant("2026-09-30", 8 * 60 + 5) }), // fire 07:55 < now
        occ({ key: "lesson:4:2026-09-30", start: kigaliInstant("2026-09-30", 7 * 60) }), // already started
      ],
      p,
      WED_0800,
      new Date(WED_0800.getTime() + 36 * 3_600_000),
    );
    expect(jobs).toEqual([]);
  });

  it("shifts a night-time deadline reminder out of quiet hours, but not a critical one", () => {
    const due = occ({
      kind: "assignment_due",
      key: "src:9",
      start: kigaliInstant("2026-10-01", 23 * 60), // 23:00 tomorrow -> 24 h reminder at 23:00 today
    });
    const jobs = planJobs([due], prefs({ morningBriefing: false }), WED_0800, new Date(WED_0800.getTime() + 36 * 3_600_000));
    const dayBefore = jobs.find((j) => j.offsetMin === 1440)!;
    expect(dayBefore.fireAt.toISOString()).toBe(kigaliInstant("2026-10-01", 6 * 60).toISOString());

    const critical = planJobs(
      [{ ...due, critical: true }],
      prefs({ morningBriefing: false }),
      WED_0800,
      new Date(WED_0800.getTime() + 36 * 3_600_000),
    );
    expect(critical.find((j) => j.offsetMin === 1440)!.fireAt.toISOString()).toBe(
      kigaliInstant("2026-09-30", 23 * 60).toISOString(),
    );
  });

  it("adds one morning briefing per day that has something on", () => {
    const now = kigaliInstant("2026-09-30", 5 * 60);
    const jobs = planJobs(
      [occ(), occ({ key: "src:1", kind: "assignment_due", title: "Essay", start: kigaliInstant("2026-09-30", 17 * 60) })],
      prefs(),
      now,
      new Date(now.getTime() + 20 * 3_600_000),
    );
    const briefing = jobs.find((j) => j.sourceType === "briefing")!;
    expect(briefing.dedupeKey).toBe("briefing:2026-09-30");
    expect(briefing.title).toBe("Your day: 1 lesson · 1 deadline");
    expect(briefing.body).toBe("First up: Physics at 10:20");
    expect(briefing.fireAt.toISOString()).toBe(kigaliInstant("2026-09-30", 6 * 60 + 30).toISOString());
  });
});

describe("Notification wording", () => {
  it("words each kind with a live lead time", () => {
    const start = kigaliInstant("2026-09-30", 8 * 60 + 15);
    expect(describeJob({ source_type: "lesson", title: "Physics", body: "S4 MPC · Lab 2", event_start: start }, WED_0800)).toEqual({
      title: "Physics in 15 min",
      body: "08:15 · S4 MPC · Lab 2",
    });
    expect(describeJob({ source_type: "assignment_due", title: "Essay", body: null, event_start: start }, WED_0800).title).toBe(
      "Due in 15 min: Essay",
    );
    expect(describeJob({ source_type: "quiz_close", title: "Algebra", body: null, event_start: start }, WED_0800).title).toBe(
      "Quiz closes in 15 min: Algebra",
    );
  });
});

describe("Calendar feed (iCalendar)", () => {
  it("builds events with alarms, escaping and CRLF line endings", () => {
    const ics = buildIcs([occ({ title: "Maths, Algebra; Part 1" })], prefs(), WED_0800);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("SUMMARY:Maths\\, Algebra\\; Part 1");
    expect(ics).toContain("DTSTART:20260930T082000Z");
    expect(ics).toContain("TRIGGER:-PT10M");
    expect(ics).toContain("UID:lesson:1:2026-09-30@reminders.nga");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const long = "DESCRIPTION:" + "é".repeat(80);
    const folded = foldLine(long);
    for (const part of folded.split("\r\n")) expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("omits alarms for kinds the user switched off", () => {
    const p = prefs();
    p.settings.lesson.enabled = false;
    expect(buildIcs([occ()], p, WED_0800)).not.toContain("BEGIN:VALARM");
  });
});

describe("Push safety", () => {
  it("accepts only real push services over https", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QK")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });

  it("binds action signatures to one reminder and one user", () => {
    const sig = signAction(42, 7);
    expect(verifyAction(42, 7, sig)).toBe(true);
    expect(verifyAction(42, 8, sig)).toBe(false);
    expect(verifyAction(43, 7, sig)).toBe(false);
    expect(verifyAction(42, 7, "")).toBe(false);
  });

  it("produces push topics within the 32-character limit", () => {
    expect(topicFor("lesson:412:2026-09-30:10")).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
