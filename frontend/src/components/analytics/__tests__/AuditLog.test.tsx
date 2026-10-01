import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuditLog, { humanAction } from "../AuditLog";

/** Audit log page: range-wide figures from the summary endpoint, URL-backed filters. */
const summary = vi.fn();
const list = vi.fn();
vi.mock("../../../api/systems", () => ({
  auditApi: { summary: (qs: string) => summary(qs), list: (qs: string) => list(qs), csv: vi.fn() },
}));
vi.mock("../../../hooks/useAccess", () => ({ useAccess: () => ({ loading: false, can: () => true }) }));
vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: { roles: [] } }) }));
vi.mock("../../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));
// recharts needs a measured box in jsdom.
vi.mock("recharts", async (orig) => {
  const m: any = await orig();
  return { ...m, ResponsiveContainer: ({ children }: any) => <div style={{ width: 600, height: 200 }}>{children}</div> };
});

const SUMMARY = {
  total: 2537,
  people: 12,
  gran: "day",
  series: [{ bucket: "2026-09-30", count: 2000 }, { bucket: "2026-10-01", count: 537 }],
  verbs: [{ verb: "DELETE", count: 82 }, { verb: "CREATE", count: 2455 }],
  actions: [{ action: "LESSON_NOTE_DELETE", verb: "DELETE", count: 82 }],
  entities: [{ entity: "LessonNote", count: 82 }],
  users: [{ user_id: 5, name: "Ingabire Christine", username: "ichristine", count: 18, last_at: "2026-10-01 09:00:00" }],
  heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)),
  busiest: { bucket: "2026-09-30", count: 2000 },
  facets: { actions: [{ value: "LESSON_NOTE_DELETE", verb: "DELETE", count: 82 }], entities: [{ value: "LessonNote", count: 82 }] },
  dateRange: { start_date: "2026-09-25", end_date: "2026-10-01" },
};

beforeEach(() => {
  summary.mockReset().mockResolvedValue(SUMMARY);
  list.mockReset().mockResolvedValue({ logs: [], pagination: { total: 0, limit: 25, offset: 0, hasMore: false } });
});

const renderPage = (url = "/analytics/audit-log") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <AuditLog />
    </MemoryRouter>,
  );

describe("Audit log page", () => {
  it("shows figures for the whole range", async () => {
    renderPage();
    expect(await screen.findByText(/2,537 entries by 12 people/)).toBeInTheDocument();
    expect(screen.getAllByText("Ingabire Christine").length).toBeGreaterThan(0);
  });

  it("filters by kind and sends it to the server", async () => {
    renderPage();
    await screen.findByText(/2,537 entries/);
    await userEvent.click(within(screen.getByRole("group", { name: "Kind of action" })).getByRole("button", { name: /Deleted/ }));
    expect(summary).toHaveBeenLastCalledWith(expect.stringContaining("verb=DELETE"));
  });

  it("filters to a person from the leaderboard", async () => {
    renderPage();
    await screen.findByText(/2,537 entries/);
    await userEvent.click(screen.getByRole("button", { name: /Ingabire Christine/ }));
    expect(summary).toHaveBeenLastCalledWith(expect.stringContaining("user_id=5"));
    expect(screen.getByRole("button", { name: "Remove person filter" })).toBeInTheDocument();
  });

  it("asks the server for one page of entries in the log view", async () => {
    renderPage("/analytics/audit-log?view=log&size=50&page=3");
    await screen.findByText(/No audit entries match/);
    expect(list).toHaveBeenLastCalledWith(expect.stringMatching(/limit=50&offset=100/));
  });

  it("reads action codes as words", () => {
    expect(humanAction("LESSON_NOTE_AI_GENERATE")).toBe("Lesson note AI generate");
  });
});
