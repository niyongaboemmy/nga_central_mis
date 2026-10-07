import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CourseTag, courseCta } from "../library/NoteCard";
import CourseLinkBanner from "../elearning/CourseLinkBanner";

/** The student sees where they are with a course note, and the reader points back to the course. */

const placement = (progress: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED") => ({
  course_id: 7,
  course_title: "Web User Interface",
  item_id: 55,
  section_id: 2,
  section_title: "Week 2 — Introduction to HTML",
  progress,
});
const note = (p: ReturnType<typeof placement> | null) => ({
  note_id: 10,
  title: "Intro",
  subject_name: "Web",
  teacher_name: "T",
  updated_at: "2026-10-01T00:00:00Z",
  source: "MANUAL" as const,
  page_count: null,
  excerpt: "",
  word_count: 10,
  reading_minutes: 1,
  placement: p,
});

describe("student course progress", () => {
  it("tags a note by the student's own progress", () => {
    const { rerender } = render(<CourseTag note={note(placement("NOT_STARTED"))} />);
    expect(screen.getByText("Week 2 · counts towards your progress")).toBeInTheDocument();
    rerender(<CourseTag note={note(placement("IN_PROGRESS"))} />);
    expect(screen.getByText("In progress · Week 2")).toBeInTheDocument();
    rerender(<CourseTag note={note(placement("COMPLETED"))} />);
    expect(screen.getByText("Done · Week 2")).toBeInTheDocument();
    rerender(<CourseTag note={note(null)} />);
    expect(screen.queryByText(/Week 2/)).not.toBeInTheDocument();
  });

  it("words the main button for where the student is", () => {
    expect(courseCta(note(null))).toBe("Read note");
    expect(courseCta(note(placement("NOT_STARTED")))).toBe("Open in e-learning");
    expect(courseCta(note(placement("IN_PROGRESS")))).toBe("Continue in e-learning");
    expect(courseCta(note(placement("COMPLETED")))).toBe("Review in e-learning");
  });

  it("the standalone reader sends a course note back to its week", () => {
    const { rerender } = render(
      <MemoryRouter>
        <CourseLinkBanner placement={placement("NOT_STARTED")} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("course-link-banner")).toHaveTextContent("so it counts towards your progress");
    expect(screen.getByRole("link", { name: /Open in my course/ })).toHaveAttribute("href", "/my-learning/courses/7/items/55");
    rerender(
      <MemoryRouter>
        <CourseLinkBanner placement={placement("COMPLETED")} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("course-link-banner")).toHaveTextContent("You finished this in Week 2");
    rerender(
      <MemoryRouter>
        <CourseLinkBanner placement={null} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("course-link-banner")).not.toBeInTheDocument();
  });
});
