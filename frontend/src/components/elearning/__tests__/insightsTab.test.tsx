import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InsightsTab from "../builder/InsightsTab";

const showToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));

const post = vi.fn();
const get = vi.fn();
vi.mock("../../../services/api", () => ({ apiService: { get: (...a: any[]) => get(...a), post: (...a: any[]) => post(...a) } }));

const analytics = {
  members: 3, active_this_week: 1, median_percent: 40, not_started: 1, behind: 1, done: 1,
  sections: [{ section_id: 1, title: "Week 1 — HTML", week_number: "Week 1", started: 2, completed: 1, started_pct: 67, completed_pct: 33, items: [] }],
  students: [
    { user_id: 1, name: "Aline", percent: 100, required_done: 2, required_total: 2, overdue: 0, seconds_spent: 600, last_seen_at: "2026-09-20", status: "done" },
    { user_id: 2, name: "Eric", percent: 0, required_done: 0, required_total: 2, overdue: 1, seconds_spent: 0, last_seen_at: null, status: "behind" },
    { user_id: 3, name: "Kevin", percent: 0, required_done: 0, required_total: 2, overdue: 0, seconds_spent: 0, last_seen_at: null, status: "not_started" },
  ],
  stuck: [{ user_id: 2, name: "Eric", status: "behind" }, { user_id: 3, name: "Kevin", status: "not_started" }],
};

// recharts needs layout; jsdom gives none — the chart is not what we assert on here.
(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

describe("InsightsTab", () => {
  beforeEach(() => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/mastery") ? { criteria_total: 0, unaligned_criteria: 0, elements: [], columns: [], students: [] } : analytics } }),
    );
    post.mockResolvedValue({ data: { data: { sent: 2 } } });
    showToast.mockClear();
    post.mockClear();
  });

  it("filters the student table and nudges the selected students", async () => {
    const user = userEvent.setup();
    render(<InsightsTab courseId={7} course={{} as any} />);
    await screen.findByText("Aline");
    await user.click(screen.getByRole("radio", { name: "Behind" }));
    expect(screen.queryByText("Aline")).not.toBeInTheDocument();
    expect(screen.getByText("Eric")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Select Eric"));
    await user.click(screen.getByRole("button", { name: /Nudge \(1\)/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/elearning/courses/7/nudge", { student_ids: [2] }));
    expect(showToast).toHaveBeenCalledWith("Sent a friendly nudge to 2 students.", "success");
  });

  it("offers a one-tap nudge to everyone behind", async () => {
    const user = userEvent.setup();
    render(<InsightsTab courseId={7} course={{} as any} />);
    await user.click(await screen.findByRole("button", { name: /Nudge everyone behind \(2\)/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/elearning/courses/7/nudge", { student_ids: [2, 3] }));
  });
});
