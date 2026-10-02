import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Agenda, ReminderPreferences } from "../../../api/reminders";
import { PreferencesPanel } from "../PreferencesPanel";
import { NowNextCard } from "../NowNextCard";

const prefs = (): ReminderPreferences => ({
  enabled: true,
  channels: { telegram: true, email: false, googleCalendar: true },
  quietStart: "21:00",
  quietEnd: "06:00",
  morningBriefing: true,
  lessonCustomized: false,
  settings: {
    lesson: { enabled: true, offsets: [10] },
    activity: { enabled: true, offsets: [10] },
    quiz_open: { enabled: true, offsets: [30] },
    quiz_close: { enabled: true, offsets: [60, 15] },
    assignment_due: { enabled: true, offsets: [1440, 120] },
    meeting: { enabled: true, offsets: [15] },
    office_hours: { enabled: true, offsets: [15] },
    event: { enabled: true, offsets: [30] },
  },
});

describe("PreferencesPanel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("autosaves a switched-off kind after a short pause, batching changes", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PreferencesPanel preferences={prefs()} onSave={onSave} isTeacher={false} />);

    fireEvent.click(screen.getByRole("switch", { name: "Activities" }));
    fireEvent.click(screen.getByRole("switch", { name: "Morning briefing" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      settings: { activity: { enabled: false, offsets: [10] } },
      morningBriefing: false,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("adds and removes reminder times, keeping at least one", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PreferencesPanel preferences={prefs()} onSave={onSave} isTeacher />);

    // The teacher default is explained until they choose their own times.
    expect(screen.getByText(/Teachers get 15 min/)).toBeInTheDocument();

    const lessonRemove = screen.getByRole("button", { name: "Remove 10 min reminder for Lessons" });
    expect(lessonRemove).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add a reminder time for Lessons" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "30 min before" }));
    expect(screen.getByRole("button", { name: "Remove 30 min reminder for Lessons" })).toBeEnabled();

    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(onSave).toHaveBeenLastCalledWith({ settings: { lesson: { enabled: true, offsets: [30, 10] } } });
  });

  it("shows a save error instead of pretending it worked", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("offline"));
    render(<PreferencesPanel preferences={prefs()} onSave={onSave} isTeacher={false} />);
    fireEvent.click(screen.getByRole("switch", { name: "Meetings" }));
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Not saved");
  });
});

describe("NowNextCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T06:25:00Z")); // 08:25 Kigali
  });
  afterEach(() => vi.useRealTimers());

  const agenda: Agenda = {
    now: "2026-09-30T06:25:00Z",
    today: "2026-09-30",
    items: [
      { key: "a", kind: "lesson", title: "Maths", detail: "S4 MPC · Room 3", location: "Room 3", link: null, color: "#2563eb", role: "attending", critical: false, start: "2026-09-30T06:00:00Z", end: "2026-09-30T06:50:00Z" },
      { key: "b", kind: "lesson", title: "Physics", detail: null, location: "Lab 2", link: null, color: null, role: "attending", critical: false, start: "2026-09-30T08:20:00Z", end: "2026-09-30T09:10:00Z" },
      { key: "c", kind: "assignment_due", title: "Essay", detail: null, location: null, link: null, color: null, role: "other", critical: false, start: "2026-09-30T15:00:00Z", end: null },
    ],
  };

  it("shows now with progress, next with a countdown, and later today", () => {
    render(<NowNextCard agenda={agenda} loading={false} />);
    expect(screen.getByText("Maths")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Lesson progress" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Physics")).toBeInTheDocument();
    expect(screen.getByText(/in 1 h 55 min/)).toBeInTheDocument();
    expect(screen.getByText("Essay")).toBeInTheDocument();
    expect(screen.getByText("Assignment due")).toBeInTheDocument();
    expect(screen.getByText(/08:25 Kigali/)).toBeInTheDocument();
  });

  it("flags an offline copy", () => {
    render(<NowNextCard agenda={agenda} loading={false} offline />);
    expect(screen.getByText("offline copy")).toBeInTheDocument();
  });

  it("is calm when the day is over", () => {
    render(<NowNextCard agenda={{ ...agenda, items: [] }} loading={false} />);
    expect(screen.getByText(/Nothing else on your timetable today/)).toBeInTheDocument();
  });
});
