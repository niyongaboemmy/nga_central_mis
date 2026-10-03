import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import OfficeHoursReports from "../reports/OfficeHoursReports";
import CoverageTab from "../admin/CoverageTab";
import PeriodPicker from "../reports/PeriodPicker";
import { toCsv } from "../reports/exports";

const showToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("recharts", async (orig) => {
  const actual = await orig<typeof import("recharts")>();
  return { ...actual, ResponsiveContainer: ({ children }: any) => <div style={{ width: 600, height: 200 }}>{children}</div> };
});

const summary = vi.fn();
const breakdown = vi.fn();
const consistency = vi.fn();
const coverage = vi.fn();
vi.mock("../../../api/officeHours", async (orig) => {
  const actual = await orig<typeof import("../../../api/officeHours")>();
  return {
    ...actual,
    officeHoursApi: {
      summary: (...a: unknown[]) => summary(...a),
      breakdown: (...a: unknown[]) => breakdown(...a),
      consistency: (...a: unknown[]) => consistency(...a),
      coverage: (...a: unknown[]) => coverage(...a),
      daily: () => Promise.resolve({ data: { data: { date: "2026-03-02", sessions: [] } } }),
    },
  };
});

const kpis = (over: Record<string, unknown> = {}) => ({
  planned: 5,
  due: 5,
  held: 4,
  unmarked: 1,
  cancelled: 1,
  cancelled_by_reason: { TEACHER_ABSENT: 1 },
  delivery_rate: 80,
  expected_attendances: 8,
  present: 3,
  late: 2,
  absent: 2,
  excused: 1,
  attendance_rate: 75,
  presence_rate: 62.5,
  punctuality: 60,
  drop_ins: 0,
  students: 4,
  bands: { CONSISTENT: 1, WATCH: 0, CHRONIC: 1, TOO_FEW: 2 },
  ...over,
});
const period = { period: "week", from: "2026-03-02", to: "2026-03-06", label: "Week of 2 Mar 2026", previous: { from: "2026-02-23", to: "2026-02-27", label: "Week of 23 Feb 2026" }, bucket: "day" };

describe("office-hours reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    summary.mockResolvedValue({
      data: {
        data: {
          period,
          scope: "school",
          kpis: kpis(),
          previous: kpis({ attendance_rate: 70, unmarked: 3, bands: { CONSISTENT: 1, WATCH: 0, CHRONIC: 2, TOO_FEW: 1 } }),
          series: [{ key: "2026-03-02", label: "2 Mar", planned: 1, held: 1, attendance_rate: 50 }],
          utilisation: { assigned: 4, capacity: 30, rate: 13.3 },
        },
      },
    });
    breakdown.mockResolvedValue({
      data: { data: { rows: [{ key: "t7", label: "Ms A", planned: 4, held: 3, unmarked: 1, cancelled: 0, delivery_rate: 75, expected_attendances: 6, attended: 4, absent: 2, attendance_rate: 66.7, presence_rate: 50, students: 2, bands: { CONSISTENT: 1, WATCH: 0, CHRONIC: 1, TOO_FEW: 0 } }] } },
    });
    consistency.mockResolvedValue({
      data: {
        data: {
          period,
          thresholds: { consistent: 90, watch: 80, min_sessions: 3 },
          consistent: [{ student_id: 1, name: "Aline U", class_group_name: "S4", office_hours: ["Maths (Ms A)"], expected: 3, present: 3, late: 0, absent: 0, excused: 0, rate: 100, presence_rate: 100, current_absent_streak: 0, longest_attended_streak: 3, band: "CONSISTENT", last_attended: "2026-03-09" }],
          watch: [],
          chronic: [{ student_id: 2, name: "Bruno N", class_group_name: "S4", office_hours: ["Maths (Ms A)"], expected: 3, present: 1, late: 0, absent: 2, excused: 0, rate: 33.3, presence_rate: 33.3, current_absent_streak: 2, longest_attended_streak: 1, band: "CHRONIC", last_attended: "2026-03-02" }],
          too_few: [],
        },
      },
    });
  });

  it("shows the KPIs with deltas against the previous period", async () => {
    render(
      <MemoryRouter>
        <OfficeHoursReports termId={3} mode="leadership" />
      </MemoryRouter>,
    );
    expect(await screen.findByText("75%")).toBeInTheDocument();
    expect(screen.getByText("+5 pts vs before")).toBeInTheDocument();
    // Fewer missing registers and fewer chronic students are improvements.
    expect(screen.getByText("-2 vs before").className).toMatch(/emerald/);
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getByText("Teacher absent: 1")).toBeInTheDocument();
    expect(summary).toHaveBeenCalledWith(expect.objectContaining({ period: "week" }));
  });

  it("breaks down by teacher with links, then lists chronic students", async () => {
    render(
      <MemoryRouter>
        <OfficeHoursReports termId={3} mode="leadership" />
      </MemoryRouter>,
    );
    await screen.findByText("75%");
    await userEvent.click(screen.getByRole("tab", { name: "Breakdown" }));
    const link = await screen.findByRole("link", { name: "Ms A" });
    expect(link).toHaveAttribute("href", "/office-hours/reports/teachers/7");
    await userEvent.selectOptions(screen.getByLabelText("Group by"), "class_group");
    await waitFor(() => expect(breakdown).toHaveBeenLastCalledWith(expect.objectContaining({ group_by: "class_group" })));

    await userEvent.click(screen.getByRole("tab", { name: "Students" }));
    expect(await screen.findByRole("tab", { name: "Chronic (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: "Bruno N" })).toHaveAttribute("href", "/office-hours/reports/students/2");
    expect(screen.getByText(/missed last 2/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Consistent (1)" }));
    expect(screen.getByRole("link", { name: "Aline U" })).toBeInTheDocument();
  });

  it("asks the server for the chosen term when switching to Term", async () => {
    render(
      <MemoryRouter>
        <OfficeHoursReports termId={3} mode="teacher" />
      </MemoryRouter>,
    );
    await screen.findByText("75%");
    await userEvent.click(screen.getByRole("radio", { name: "Term" }));
    await waitFor(() => expect(summary).toHaveBeenLastCalledWith(expect.objectContaining({ period: "term", term_id: 3 })));
  });

  it("escapes CSV cells", () => {
    expect(toCsv({ title: "x", columns: ["Name", "Note"], rows: [["Uwase, Aline", 'Said "sick"'], ["B", null]] })).toBe('Name,Note\n"Uwase, Aline","Said ""sick"""\nB,');
  });

  it("steps periods without landing on a weekend day", async () => {
    const onChange = vi.fn();
    render(<PeriodPicker value={{ period: "day", anchor: "2026-03-09" }} onChange={onChange} label="9 Mar" />);
    await userEvent.click(screen.getByRole("button", { name: "Previous period" }));
    expect(onChange).toHaveBeenCalledWith({ period: "day", anchor: "2026-03-06" });
  });

  it("draws coverage by class and day, and lists students without office hours", async () => {
    coverage.mockResolvedValue({
      data: {
        data: {
          term_id: 3,
          class_groups: [{ class_group_id: 5, name: "S4 MPC", students: 30, covered: 12, coverage_rate: 40, days: { 1: 6, 2: 0, 3: 6, 4: 3, 5: 0 } }],
          students_without: [],
        },
      },
    });
    render(<CoverageTab termId={3} />);
    expect(await screen.findByLabelText("S4 MPC Mon: 6 students")).toBeInTheDocument();
    expect(screen.getByText("12/30 · 40%")).toBeInTheDocument();
    coverage.mockResolvedValueOnce({ data: { data: { term_id: 3, class_groups: [{ class_group_id: 5, name: "S4 MPC", students: 30, covered: 12, coverage_rate: 40, days: { 1: 6, 2: 0, 3: 6, 4: 3, 5: 0 } }], students_without: [{ student_id: 9, name: "Chantal I" }] } } });
    await userEvent.click(screen.getByRole("button", { name: "S4 MPC" }));
    const list = await screen.findByText("Chantal I");
    expect(within(list.closest("ul")!).getAllByRole("listitem")).toHaveLength(1);
    expect(coverage).toHaveBeenLastCalledWith(3, 5);
  });
});
