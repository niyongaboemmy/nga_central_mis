import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const api = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("../../../api/competency", async (orig) => ({ ...(await orig<object>()), myCompetencesApi: api }));

import MyCompetences from "../MyCompetences";

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });
const subject = (id: number, name: string, states: string[]) => ({
  subject_id: id, name, code: null, color: "#2563eb", total: states.length,
  demonstrated: states.filter((s) => s === "DEMONSTRATED").length,
  assessed: states.filter((s) => s !== "NOT_COVERED").length,
  outcomes: [{
    competency_id: id * 10, element_number: 1, title: `${name} outcome`,
    criteria: states.map((state, i) => ({
      criteria_id: id * 100 + i, criteria_number: `1.${i + 1}`, description: `Skill ${i + 1}`, state,
      evidence: state === "NOT_COVERED" ? [] : [{ kind: "quiz", source: "taskmentor", ref: 1, title: `Quiz ${i + 1}`, score_pct: state === "DEMONSTRATED" ? 82 : 45, at: "2026-10-06T09:00:00Z" }],
    })),
  }],
});

describe("My competences page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the overall count and each subject's skills in plain words with the work behind them", async () => {
    api.me.mockReturnValue(ok({ competent_pct: 70, subjects: [subject(1, "Networking", ["DEMONSTRATED", "COVERED", "NOT_COVERED"]), subject(2, "English", ["DEMONSTRATED"])] }));
    render(<MyCompetences />);
    expect(await screen.findByTestId("comp-overall")).toHaveTextContent("2 of 4 skills shown across 2 subjects.");
    const [net] = screen.getAllByTestId("comp-subject");
    expect(net).toHaveTextContent("1 of 3 shown, 1 practising");
    expect(within(net).getByRole("img")).toHaveAttribute("aria-label", "33% shown, 33% practising");
    expect(net).toHaveTextContent("1.1 Skill 1Shown");
    expect(net).toHaveTextContent("Quiz: Quiz 2 · 45% · 2026-10-06");
    expect(net).toHaveTextContent("1.3 Skill 3Not yet");
    expect(net).toHaveAttribute("open");
  });

  it("explains an empty page", async () => {
    api.me.mockReturnValue(ok({ competent_pct: 70, subjects: [] }));
    render(<MyCompetences />);
    expect(await screen.findByText("Nothing to show yet")).toBeTruthy();
  });
});
