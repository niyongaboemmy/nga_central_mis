import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyLearningHome from "../MyLearningHome";

const myCoursesMock = vi.fn();
const apiGetMock = vi.fn();

vi.mock("../../../../api/elearning", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../api/elearning")>();
  return { ...actual, elearningApi: { myCourses: (...a: any[]) => myCoursesMock(...a) } };
});

vi.mock("../../../../services/api", () => ({
  apiService: { get: (...a: any[]) => apiGetMock(...a) },
}));

vi.mock("../../../../contexts/UserContext", () => ({
  useUser: () => ({ user: { profile: { first_name: "Test" } } }),
}));

vi.mock("../useLearningPrefs", () => ({
  useLearningPrefs: () => ({ prefs: { streak_enabled: true } }),
}));

const card = (over: Partial<any> = {}) => ({
  course_id: 1,
  title: "Web Application Development Using JavaScript",
  description: null,
  icon: null,
  cover_color: "#a3c93a",
  subject_id: 10,
  subject_name: "Web Application Development Using JavaScript",
  subject_code: "SPEWJ302",
  class_group_name: "L3. Class A",
  term_name: "Term 1",
  teacher_name: "Niyongabo Emmanuel",
  published_sections: 3,
  last_activity_at: null,
  percent: 100,
  required_total: 6,
  required_done: 6,
  overdue_count: 0,
  due_soon: [],
  current_section: { section_id: 5, title: "Week 3 — Data Types", state: "started" },
  next_item: null,
  resume_item: null,
  sections_completed: 3,
  sections_total: 15,
  near_goal: [],
  criteria_total: 8,
  criteria_covered: 5,
  ...over,
});

const renderHome = () =>
  render(
    <MemoryRouter>
      <MyLearningHome />
    </MemoryRouter>,
  );

describe("MyLearningHome — the page has to agree with itself", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockResolvedValue({ data: { data: { weeks: 1, this_week: true } } });
  });

  it("does not say 'Up next' when there is nothing next", async () => {
    myCoursesMock.mockResolvedValue({ data: { data: [card()] } });
    renderHome();

    // The old hero printed "Up next" above "You're all caught up for now."
    await screen.findByText(/Nothing left to do right now/i);
    expect(screen.queryByText("Up next")).not.toBeInTheDocument();
    // …and still offers a way forward rather than a dead end.
    expect(screen.getByRole("button", { name: /Browse the course/i })).toBeInTheDocument();
  });

  it("greets a finished student as finished, not as having a week waiting", async () => {
    myCoursesMock.mockResolvedValue({ data: { data: [card()] } });
    renderHome();

    await waitFor(() =>
      expect(screen.getByText(/Everything your teachers have set is done/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/is waiting/i)).not.toBeInTheDocument();
  });

  it("shows 'Up next' with a start button when something is actually queued", async () => {
    myCoursesMock.mockResolvedValue({
      data: {
        data: [
          card({
            percent: 50,
            required_done: 3,
            next_item: {
              item_id: 99,
              title: "Type conversion",
              item_type: "LESSON_NOTE",
              estimated_minutes: 10,
              section_id: 5,
              state: "NOT_STARTED",
            },
          }),
        ],
      },
    });
    renderHome();

    expect(await screen.findByText("Up next")).toBeInTheDocument();
    // The hero and the subject card both name it — that repetition is deliberate.
    expect(screen.getAllByText("Type conversion").length).toBeGreaterThan(0);
  });

  it("leads with overdue work, loudly, above everything else", async () => {
    myCoursesMock.mockResolvedValue({
      data: { data: [card({ overdue_count: 2, required_done: 4, percent: 66 })] },
    });
    renderHome();

    // Once in the alert strip at the top, once on the subject card.
    expect((await screen.findAllByText("2 overdue")).length).toBeGreaterThan(0);
    expect(screen.getByText(/past due/i)).toBeInTheDocument();
  });

  it("reports real totals across subjects instead of three empty boxes", async () => {
    myCoursesMock.mockResolvedValue({
      data: {
        data: [
          card({ required_total: 6, required_done: 3, sections_completed: 2, sections_total: 10, criteria_covered: 4, criteria_total: 8 }),
          card({ course_id: 2, subject_name: "Develop Web Application Using PHP", required_total: 4, required_done: 1, sections_completed: 1, sections_total: 10, criteria_covered: 2, criteria_total: 8 }),
        ],
      },
    });
    renderHome();

    // 4 of 10 required done across both subjects = 40%.
    expect(await screen.findByText("40%")).toBeInTheDocument();
    expect(screen.getByText("3/20")).toBeInTheDocument(); // weeks finished
    expect(screen.getByText("6/16")).toBeInTheDocument(); // skills covered
  });

  it("labels the streak instead of showing a bare number", async () => {
    myCoursesMock.mockResolvedValue({ data: { data: [card()] } });
    apiGetMock.mockResolvedValue({ data: { data: { weeks: 3, this_week: true } } });
    renderHome();

    expect(await screen.findByText("3-week streak")).toBeInTheDocument();
  });
});
