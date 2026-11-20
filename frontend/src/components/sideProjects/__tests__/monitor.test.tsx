import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MonitorRow } from "../../../api/sideProjects";

vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: { user: { user_id: 1 } } }) }));

import { Pager, StageCell, pageList } from "../monitor/ProjectsMonitor";

const row = (over: Partial<MonitorRow>): MonitorRow => ({ status: "TESTING", pausedFrom: null, stage: { daysIn: 1, daysLeft: 10, overrunDays: 0, plannedEnd: "2026-11-30" }, lastReport: null, ...over }) as unknown as MonitorRow;

describe("time in stage, on one line", () => {
  it("summarises the stage and the report in one row that never wraps", () => {
    const { container } = render(<StageCell r={row({})} />);
    expect(container.textContent).toBe("Day 2· 10d leftNo report");
    expect(container.querySelectorAll(".whitespace-nowrap").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTitle(/Day 2 in Testing, 10 days left/)).toBeTruthy();
    expect(screen.getByTitle("No progress report yet")).toBeTruthy();
  });
  it("shows days over the plan, a fresh report, pauses and completion", () => {
    const { container, rerender } = render(<StageCell r={row({ stage: { daysIn: 8, daysLeft: null, overrunDays: 3, plannedEnd: null } as any, lastReport: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10) })} />);
    expect(container.textContent).toMatch(/^Day 9· 3d over(3d|2d)$/);
    rerender(<StageCell r={row({ status: "ON_HOLD", pausedFrom: "IN_PROGRESS", stage: { daysIn: 4, daysLeft: null, overrunDays: 0, plannedEnd: null } as any })} />);
    expect(container.textContent).toContain("4d paused · Building");
    rerender(<StageCell r={row({ status: "COMPLETED" })} />);
    expect(container.textContent).toBe("Completed");
  });
});

describe("pagination", () => {
  it("lists pages with gaps", () => {
    expect(pageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageList(1, 12)).toEqual([1, 2, "gap", 12]);
  });
  const onPage = vi.fn();
  const onSize = vi.fn();
  beforeEach(() => {
    onPage.mockReset();
    onSize.mockReset();
  });
  it("shows the range, moves between pages and changes the page size", () => {
    render(<Pager page={2} size={25} total={120} onPage={onPage} onSize={onSize} />);
    expect(screen.getByText("26–50 of 120 projects")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Page 5" }));
    expect(onPage).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPage).toHaveBeenCalledWith(3);
    const select = screen.getAllByLabelText("Rows per page").find((e) => e.tagName === "SELECT")!;
    fireEvent.change(select, { target: { value: "50" } });
    expect(onSize).toHaveBeenCalledWith(50);
  });
  it("disables the arrows at the ends", () => {
    render(<Pager page={1} size={25} total={2} onPage={onPage} onSize={onSize} />);
    expect(screen.getByText("1–2 of 2 projects")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
