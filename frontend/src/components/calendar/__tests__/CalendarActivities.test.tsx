import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarGrid from "../CalendarGrid";
import CalendarSlotModal from "../CalendarSlotModal";
import type { CalendarActivity } from "../../../api/calendar";

const weekDates = Array.from({ length: 7 }, (_, i) => {
  const d = new Date("2026-09-07T00:00:00");
  d.setDate(d.getDate() + i);
  return d;
});

const activity = (over: Partial<CalendarActivity> = {}): CalendarActivity => ({
  activity_id: 42,
  academic_term_id: 3,
  class_group_id: 5,
  activity_name: "Morning Devotion",
  activity_type: "Devotion",
  day_of_week: 1, // Monday (backend: 0=Sun)
  start_time: "08:00",
  end_time: "08:50",
  color: "#F59E0B",
  is_recurring: 1,
  ...over,
});

describe("custom activities on the calendar grid", () => {
  it("colours each activity block from its own colour", () => {
    const { container } = render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L4. Class A"
        slots={[]}
        activities={[
          activity({ activity_id: 1, activity_name: "Chapel Time", color: "#F59E0B", day_of_week: 1 }),
          activity({ activity_id: 2, activity_name: "Sports Club", color: "#7C3AED", day_of_week: 2 }),
        ]}
        weekDates={weekDates}
        onSlotClick={() => {}}
        onEmptyCellClick={() => {}}
        onActivityClick={() => {}}
      />,
    );

    const bgOf = (name: string) => {
      let el: HTMLElement | null = screen.getByText(name);
      while (el && !el.style.getPropertyValue("--slot-bg")) el = el.parentElement;
      return el?.style.getPropertyValue("--slot-bg") ?? "";
    };

    expect(bgOf("Chapel Time")).not.toBe("");
    expect(bgOf("Sports Club")).not.toBe("");
    // Two differently-coloured activities get two different block colours
    expect(bgOf("Chapel Time")).not.toBe(bgOf("Sports Club"));
    expect(container).toBeTruthy();
  });

  it("routes a click on an activity to onActivityClick, not onSlotClick", async () => {
    const onActivityClick = vi.fn();
    const onSlotClick = vi.fn();
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L4. Class A"
        slots={[]}
        activities={[activity()]}
        weekDates={weekDates}
        onSlotClick={onSlotClick}
        onEmptyCellClick={() => {}}
        onActivityClick={onActivityClick}
      />,
    );

    await userEvent.click(screen.getByText("Morning Devotion"));
    expect(onActivityClick).toHaveBeenCalledWith(
      expect.objectContaining({ activity_id: 42 }),
    );
    expect(onSlotClick).not.toHaveBeenCalled();
  });

  it("skips one-off (no day_of_week) activities on the weekly grid", () => {
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L4. Class A"
        slots={[]}
        activities={[activity({ day_of_week: undefined })]}
        weekDates={weekDates}
        onSlotClick={() => {}}
        onEmptyCellClick={() => {}}
        onActivityClick={() => {}}
      />,
    );
    expect(screen.queryByText("Morning Devotion")).not.toBeInTheDocument();
  });
});

describe("CalendarSlotModal — activity form", () => {
  const baseProps = {
    showModal: true,
    selectedSlot: null,
    formData: {
      class_group_id: "5",
      subject_id: "",
      user_id: "",
      day_of_week: "0",
      start_time: "08:00",
      end_time: "08:50",
      location: "",
    },
    formErrors: {},
    effectiveClassGroupId: 5,
    setupData: null,
    onClose: () => {},
    onSubmit: () => {},
    onFormDataChange: () => {},
    onErrorsChange: () => {},
    onDelete: () => {},
    mode: "form" as const,
    canEdit: true,
    canViewLessonPlan: false,
    onEditClick: () => {},
    onViewLessonPlan: () => {},
  };

  it("shows the activity fields when the entry kind is 'activity'", () => {
    render(
      <CalendarSlotModal
        {...baseProps}
        canManageActivities
        entryKind="activity"
        activityForm={{
          activity_name: "",
          activity_type: "",
          day_of_week: "0",
          start_time: "08:00",
          end_time: "08:50",
          location: "",
          description: "",
          color: "#10B981",
        }}
        activityErrors={{}}
        onEntryKindChange={() => {}}
        onActivityFormChange={() => {}}
        onActivityErrorsChange={() => {}}
        onActivitySubmit={() => {}}
        onActivityDelete={() => {}}
      />,
    );

    expect(screen.getByText("Add Custom Activity")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Morning Devotion, Sports Afternoon/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Activity" }),
    ).toBeInTheDocument();
  });

  it("submits the activity form via onActivitySubmit", async () => {
    const onActivitySubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <CalendarSlotModal
        {...baseProps}
        canManageActivities
        entryKind="activity"
        activityForm={{
          activity_name: "Sports",
          activity_type: "Sports",
          day_of_week: "0",
          start_time: "08:00",
          end_time: "08:50",
          location: "",
          description: "",
          color: "#10B981",
        }}
        activityErrors={{}}
        onEntryKindChange={() => {}}
        onActivityFormChange={() => {}}
        onActivityErrorsChange={() => {}}
        onActivitySubmit={onActivitySubmit}
        onActivityDelete={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Create Activity" }),
    );
    expect(onActivitySubmit).toHaveBeenCalled();
  });
});
