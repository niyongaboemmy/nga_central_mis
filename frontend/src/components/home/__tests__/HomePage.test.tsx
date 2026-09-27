import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HomePage from "../HomePage";
import type { AttentionItem, HomeOverview } from "../contract";

const api = vi.hoisted(() => ({ getHomeOverview: vi.fn(), getHomeAppSummary: vi.fn() }));
vi.mock("../../../api/home", () => ({
  getHomeOverview: api.getHomeOverview,
  getHomeAppSummary: api.getHomeAppSummary,
  HOME_OVERVIEW_TIMEOUT_MS: 30000,
}));
vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: { user: { user_id: 7 } } }),
}));
vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYearId: 5, selectedTermId: 9 }),
}));
vi.mock("../../../contexts/NotificationContext", () => ({
  useNotifications: () => ({
    notifications: [
      {
        notification: {
          notification_id: 1,
          user_id: 7,
          kind: "document_shared",
          title: "Exam timetable shared with you",
          body: null,
          link: "/documents",
          subject_type: null,
          subject_id: null,
          actor_id: null,
          read_at: null,
          created_at: new Date().toISOString(),
        },
        actor: null,
      },
    ],
    unreadCount: 1,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  }),
}));
// Freeze "now" at 10:00 so lesson states are deterministic.
vi.mock("../../calendar/useCurrentTime", () => ({
  useCurrentTime: () => ({ minutes: 600, date: new Date("2026-09-25T10:00:00") }),
}));

const item = (over: Partial<AttentionItem>): AttentionItem => ({
  id: over.id ?? `id-${Math.random()}`,
  source: "mis",
  kind: "T-04",
  tier: "slipping",
  lens: "TEACHING",
  via: [1],
  depth: "write",
  count: 1,
  title: "Item",
  entities: [],
  why: "Because",
  cta: { label: "Go", href: "/somewhere" },
  ...over,
});

const overview = (over: Partial<HomeOverview> = {}): HomeOverview => ({
  version: 1,
  viewer: { user_id: 7, first_name: "Aline", last_name: "M", persona: "TEACHER" },
  access: { source: "legacy", mode: "shadow", version: 0 },
  period: {
    academic_year_id: 5,
    academic_year_name: "2026",
    academic_term_id: 9,
    academic_term_name: "Term 1",
    term_start_date: "2026-09-01",
    term_end_date: "2026-12-01",
    week_of_term: 4,
    weeks_in_term: 13,
  },
  lenses: [
    { key: "PROGRAM:2", type: "PROGRAM", label: "Sciences", reason: "Programme lead", via: [3] },
    { key: "TEACHING", type: "TEACHING", label: "Teaching", reason: "Subject teacher", via: [1] },
    { key: "SELF", type: "SELF", label: "Me", reason: "TEACHER", via: [2] },
  ],
  default_lens: "EVERYTHING",
  today: {
    date: "2026-09-25",
    server_now: "2026-09-25T10:00:00Z",
    day_of_week: 5,
    lessons: [
      {
        lesson_key: "a",
        kind: "teaching",
        slot_id: 1,
        subject_id: 1,
        subject_name: "Mathematics",
        class_group_id: 1,
        class_group_name: "S3B",
        start_time: "11:00",
        end_time: "11:40",
        location: "Room 4",
        color: null,
        plan: "missing",
        report: "upcoming",
        href: "/reporting",
      },
    ],
    activities: [],
    next_teaching_day: null,
  },
  items: [
    item({ id: "a", tier: "blocking", title: "1 scheme of work not submitted", lens: "TEACHING", entities: ["Maths · S3B"] }),
    item({ id: "b", tier: "slipping", title: "3 schemes waiting for your validation", lens: "PROGRAM:2", kind: "P-01" }),
    item({ id: "c", tier: "slipping", title: "4 students are not enrolled in every subject", lens: "PROGRAM:2", depth: "summary", entities: ["Secret Name"] }),
  ],
  tiles: [{ id: "t1", source: "mis", lens: "TEACHING", label: "Lessons today", value: "1", href: "/dashboard" }],
  quick_actions: [{ id: "q1", label: "Report a lesson", href: "/reporting", icon: "clipboard", lens: "TEACHING" }],
  apps: [],
  degraded: [],
  generated_at: "2026-09-25T10:00:00Z",
  ...over,
});

const renderHome = () =>
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <HomePage />
    </MemoryRouter>,
  );

beforeEach(() => {
  api.getHomeOverview.mockReset();
  api.getHomeAppSummary.mockReset();
  sessionStorage.clear();
  localStorage.clear();
});

describe("Home", () => {
  it("greets the user and leads with the most urgent thing", async () => {
    api.getHomeOverview.mockResolvedValue(overview());
    renderHome();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Good morning, Aline");
    const hero = screen.getByRole("region", { name: "Next up" });
    expect(within(hero).getByText("1 scheme of work not submitted")).toBeInTheDocument();
    expect(within(hero).getByText(/Needs you now/)).toBeInTheDocument();
    expect(api.getHomeOverview).toHaveBeenCalledWith(expect.objectContaining({ academic_year_id: 5, academic_term_id: 9 }));
  });

  it("shows today's lessons with their plan/report marks, and updates from every module", async () => {
    api.getHomeOverview.mockResolvedValue(overview());
    renderHome();
    expect((await screen.findAllByText("Mathematics")).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Plan: missing").length).toBeGreaterThan(0);
    expect(screen.getByText("Exam timetable shared with you")).toBeInTheDocument();
  });

  it("focuses on one position when a lens is chosen", async () => {
    // Four items: below that there is nothing worth filtering and no switcher.
    const base = overview();
    api.getHomeOverview.mockResolvedValue(
      overview({ items: [...base.items, item({ id: "d", tier: "tidy", title: "2 notes to tidy", lens: "TEACHING" })] }),
    );
    renderHome();
    await screen.findByRole("group", { name: "Focus" });
    const sciences = screen.getByRole("button", { name: /Sciences/ });
    fireEvent.click(sciences);
    expect(sciences).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByRole("region", { name: "Needs you" });
    expect(within(list).queryByText("1 scheme of work not submitted")).not.toBeInTheDocument();
    // Shown once: as Next up for this focus, not repeated in the list.
    expect(screen.getAllByText("3 schemes waiting for your validation")).toHaveLength(1);
  });

  it("hides the focus switcher when there is too little to filter", async () => {
    api.getHomeOverview.mockResolvedValue(overview());
    renderHome();
    await screen.findByRole("region", { name: "Next up" });
    expect(screen.queryByRole("group", { name: "Focus" })).not.toBeInTheDocument();
  });

  it("never renders names on a summary-depth item", async () => {
    api.getHomeOverview.mockResolvedValue(overview());
    renderHome();
    await screen.findByText("4 students are not enrolled in every subject");
    expect(screen.queryByText("Secret Name")).not.toBeInTheDocument();
  });

  it("explains why an item is shown", async () => {
    api.getHomeOverview.mockResolvedValue(overview());
    renderHome();
    await screen.findByText("3 schemes waiting for your validation");
    fireEvent.click(screen.getAllByRole("button", { name: "Why am I seeing this?" })[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Programme lead");
  });

  it("never hides anything that needs you now behind 'show more'", async () => {
    const many = Array.from({ length: 7 }, (_, i) => item({ id: `b${i}`, tier: "blocking", title: `Blocking thing ${i}` }));
    const calm = Array.from({ length: 7 }, (_, i) => item({ id: `s${i}`, tier: "slipping", title: `Slipping thing ${i}` }));
    api.getHomeOverview.mockResolvedValue(overview({ items: [...many, ...calm] }));
    renderHome();
    const list = await screen.findByRole("region", { name: "Needs you" });
    // The first one leads as Next up; every other one is in the list, none capped.
    expect(within(screen.getByRole("region", { name: "Next up" })).getByText("Blocking thing 0")).toBeInTheDocument();
    expect(within(list).queryByText("Blocking thing 0")).not.toBeInTheDocument();
    for (let i = 1; i < 7; i++) expect(within(list).getByText(`Blocking thing ${i}`)).toBeInTheDocument();
    expect(within(list).queryByText("Slipping thing 6")).not.toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Show 3 more" })).toBeInTheDocument();
  });

  it("closes the explanation with Escape and keeps focus on its button", async () => {
    api.getHomeOverview.mockResolvedValue(overview());
    renderHome();
    await screen.findByText("3 schemes waiting for your validation");
    const why = screen.getAllByRole("button", { name: "Why am I seeing this?" })[0];
    why.focus();
    fireEvent.click(why);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(why, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(why);
  });

  it("says in words which apps aren't answering", async () => {
    api.getHomeOverview.mockResolvedValue(overview({ apps: [{ source: "tupo", name: "Tupo" }] }));
    api.getHomeAppSummary.mockResolvedValue({ source: "tupo", status: "unavailable", message: "Tupo could not be reached" });
    renderHome();
    expect(await screen.findByText(/Tupo isn't answering right now/)).toBeInTheDocument();
  });

  it("speaks to students about overdue work and hides the switcher when there is one lens", async () => {
    api.getHomeOverview.mockResolvedValue(
      overview({
        viewer: { user_id: 7, first_name: "Kevin", last_name: "N", persona: "STUDENT" },
        lenses: [{ key: "SELF", type: "SELF", label: "Me", reason: "STUDENT", via: [] }],
        items: [item({ id: "s", tier: "blocking", lens: "SELF", kind: "S-04", title: "2 learning activities are overdue" })],
        today: { ...overview().today, lessons: [] },
      }),
    );
    renderHome();
    expect(await screen.findByRole("heading", { name: "Your to-do" })).toBeInTheDocument();
    expect(screen.getAllByText(/Overdue/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("group", { name: "Focus" })).not.toBeInTheDocument();
  });

  it("celebrates an empty list", async () => {
    api.getHomeOverview.mockResolvedValue(overview({ items: [], today: { ...overview().today, lessons: [] } }));
    renderHome();
    expect((await screen.findAllByText("You're all caught up")).length).toBeGreaterThan(0);
  });

  it("names the failure and offers a retry when Home can't load", async () => {
    api.getHomeOverview.mockRejectedValueOnce({ code: "ECONNABORTED", message: "timeout of 30000ms exceeded" });
    renderHome();
    expect(await screen.findByText("We couldn't load your Home")).toBeInTheDocument();
    expect(screen.getByText(/took too long/)).toBeInTheDocument();
    api.getHomeOverview.mockResolvedValue(overview());
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Good morning, Aline")).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load your Home")).not.toBeInTheDocument();
  });

  it("paints the last visit instantly while the fresh copy loads", async () => {
    sessionStorage.setItem("home.snapshot.7", JSON.stringify(overview({ items: [] })));
    api.getHomeOverview.mockReturnValue(new Promise(() => {}));
    renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Aline");
    expect(screen.getByText("Updating…")).toBeInTheDocument();
  });

  it("folds in the other apps: their items, register marks, messages, and who is unreachable", async () => {
    api.getHomeOverview.mockResolvedValue(
      overview({
        apps: [
          { source: "attendance", name: "Discipline & Attendance" },
          { source: "tupo", name: "Tupo" },
          { source: "taskmentor", name: "Task Mentor" },
        ],
      }),
    );
    api.getHomeAppSummary.mockImplementation((source: string) =>
      Promise.resolve(
        source === "attendance"
          ? {
              source,
              status: "ok",
              summary: {
                version: 1, source, generated_at: "", provisioned: true,
                items: [item({ id: "attendance:T-01", source: "attendance", kind: "T-01", tier: "blocking",
                  title: "1 register not taken today", cta: { label: "Take register", href: "https://da.example/attendance", external: true } })],
                tiles: [], updates: [], comms: null, app_url: "https://da.example",
                today_marks: [{ lesson_key: "a", status: "missing", href: null }],
              },
            }
          : source === "tupo"
            ? {
                source,
                status: "ok",
                summary: {
                  version: 1, source, generated_at: "", provisioned: true, items: [], tiles: [], today_marks: [],
                  updates: [{ id: "tupo:1", source, kind: "feed.announcement", title: "Sports day on Friday", body: null,
                    severity: "info", created_at: new Date().toISOString(), read: false, href: null }],
                  comms: { chat_unread: 5, mentions: 2, mail_unread: 3,
                    meetings: [{ id: "m1", title: "Staff briefing", starts_at: new Date().toISOString(), live: true, href: "https://tupo.example/meet/m1" }] },
                  app_url: "https://tupo.example",
                },
              }
            : { source, status: "unavailable", message: "Task Mentor took too long to answer" },
      ),
    );
    renderHome();
    // Every link to it opens the app in a new tab.
    const links = await screen.findAllByRole("link", { name: /Take register/ });
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("href", "https://da.example/attendance");
    }
    expect(screen.getAllByLabelText("Register: missing").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Messages & meetings" })).toHaveTextContent("2 mentions");
    expect(screen.getByRole("link", { name: /Join/ })).toHaveAttribute("href", "https://tupo.example/meet/m1");
    expect(screen.getByText("Sports day on Friday")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Connected apps" })).toHaveTextContent("Task Mentor");
    expect(screen.getByTitle("Task Mentor took too long to answer")).toBeInTheDocument();
    // Shown exactly once across Next up and the list.
    expect(screen.getAllByText("1 register not taken today")).toHaveLength(1);
  });
});
