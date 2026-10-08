import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({ me: vi.fn(), savePrefs: vi.fn(), importParents: vi.fn(), competences: vi.fn() }));
vi.mock("../../../api/families", async (orig) => ({ ...(await orig<object>()), familiesApi: api }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import MyChildren from "../MyChildren";
import ImportParents from "../ImportParents";
import { parseImport } from "../../../api/families";

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });

describe("families", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses pasted rows (comma, semicolon or tab) and skips a header", () => {
    expect(parseImport("Student,Parent,Email\nNGA001, Marie Uwase, marie@x.rw, +250788, mother\nNGA002;Jean K;jean@x.rw\n\n")).toEqual([
      { student: "NGA001", parentName: "Marie Uwase", email: "marie@x.rw", phone: "+250788", relationship: "mother" },
      { student: "NGA002", parentName: "Jean K", email: "jean@x.rw", phone: undefined, relationship: undefined },
    ]);
  });

  it("parents see each child in plain words and choose how the summary reaches them", async () => {
    api.me.mockReturnValue(ok({
      children: [
        { studentId: 5, name: "Aline Uwase", firstName: "Aline", className: "S2 A", asOf: "2026-10-07", attendance: "In the last 2 weeks: missed 3 lessons.", conduct: "No discipline notes this month.", schoolwork: "Handed in 4 of 5 pieces of work in the last 2 weeks.", attention: true },
        { studentId: 6, name: "Bob Uwase", firstName: "Bob", className: null, asOf: null, attendance: null, conduct: null, schoolwork: null, attention: false },
      ],
      preferences: { weeklyDigest: true, digestEmail: true },
      telegramLinked: false,
    }));
    api.savePrefs.mockReturnValue(ok({ weeklyDigest: true, digestEmail: false }));
    render(<MemoryRouter><MyChildren /></MemoryRouter>);
    const kids = await screen.findByTestId("fam-children");
    expect(kids).toHaveTextContent("Aline UwaseS2 A");
    expect(kids).toHaveTextContent("Worth a conversation this week");
    expect(kids).toHaveTextContent("missed 3 lessons");
    expect(kids).toHaveTextContent("No information from the school yet.");
    expect(screen.getByRole("link", { name: "Connect Telegram" })).toHaveAttribute("href", "/reminders");
    fireEvent.click(screen.getByLabelText("Also by email"));
    await waitFor(() => expect(api.savePrefs).toHaveBeenCalledWith({ digestEmail: false }));
  });

  it("registrars paste a list and see one result per row", async () => {
    api.importParents.mockReturnValue(ok([{ row: 1, outcome: "created" }, { row: 2, outcome: "error", message: 'No active student "X9"' }]));
    render(<ImportParents />);
    fireEvent.change(screen.getByLabelText("Parents"), { target: { value: "NGA001, Marie Uwase, marie@x.rw\nX9, Jean K, jean@x.rw" } });
    fireEvent.click(screen.getByRole("button", { name: "Import 2 rows" }));
    await waitFor(() => expect(api.importParents).toHaveBeenCalledWith([
      { student: "NGA001", parentName: "Marie Uwase", email: "marie@x.rw", phone: undefined, relationship: undefined },
      { student: "X9", parentName: "Jean K", email: "jean@x.rw", phone: undefined, relationship: undefined },
    ]));
    const res = await screen.findByTestId("imp-results");
    expect(res).toHaveTextContent("Marie Uwase → NGA001Account created");
    expect(res).toHaveTextContent('Not imported: No active student "X9"');
  });

  it("parents see a skills sentence and open a child's skills", async () => {
    api.me.mockReturnValue(ok({
      children: [{ studentId: 5, name: "Aline Uwase", firstName: "Aline", className: "S2 A", asOf: null, attendance: null, conduct: null, schoolwork: null, attention: false, skills: "Has shown 3 of 20 skills in their subjects so far." }],
      preferences: { weeklyDigest: true, digestEmail: true },
      telegramLinked: true,
    }));
    api.competences.mockReturnValue(ok({ competent_pct: 70, subjects: [{
      subject_id: 9, name: "English", code: null, color: null, total: 2, demonstrated: 1, assessed: 2,
      outcomes: [{ competency_id: 1, element_number: 1, title: "Speak about daily life", criteria: [
        { criteria_id: 11, criteria_number: "1.1", description: "Greet people", state: "DEMONSTRATED", evidence: [{ kind: "quiz", source: "taskmentor", ref: 1, title: "Speaking quiz", score_pct: 85, at: null }] },
        { criteria_id: 12, criteria_number: "1.2", description: "Describe a routine", state: "COVERED", evidence: [] },
      ] }],
    }] }));
    render(<MemoryRouter><MyChildren /></MemoryRouter>);
    const kids = await screen.findByTestId("fam-children");
    expect(kids).toHaveTextContent("SkillsHas shown 3 of 20 skills in their subjects so far.");
    fireEvent.click(within(kids).getByRole("button", { name: "See Aline's skills" }));
    const dialog = await screen.findByTestId("fam-skills");
    expect(api.competences).toHaveBeenCalledWith(5);
    expect(await within(dialog).findByText("English")).toBeTruthy();
    expect(dialog).toHaveTextContent("1.1 Greet peopleShown");
    expect(dialog).toHaveTextContent("Quiz: Speaking quiz · 85%");
    expect(dialog).toHaveTextContent("1.2 Describe a routinePractising");
  });
});
