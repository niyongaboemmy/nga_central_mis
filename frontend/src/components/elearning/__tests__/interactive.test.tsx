import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateInlineChecks } from "../interactive/hydrate";
import { extractFlashcards } from "../learner/ReviewSheet";
import KnowledgeCheckCard from "../learner/KnowledgeCheckCard";

const post = vi.fn();
vi.mock("../../../services/api", () => ({ apiService: { post: (...a: any[]) => post(...a), get: vi.fn() } }));
vi.mock("../../../api/lessonNotes", () => ({ lessonNotesApi: { getShared: vi.fn() } }));
vi.mock("../../../api/elearning", () => ({ elearningApi: { openItem: vi.fn() } }));

describe("hydrateInlineChecks (note reader)", () => {
  it("turns a static inline-check block into a live check with kind feedback and retry", async () => {
    const user = userEvent.setup();
    const root = document.createElement("div");
    root.innerHTML =
      '<div data-type="inline-check" data-check=\'{"prompt":"Which sets inner space?","options":["margin","padding"],"correct":1,"explanation":"padding sits inside the border."}\'><p>Which sets inner space?</p></div>' +
      '<details data-type="reveal"><summary>Show the answer</summary><div><p>42</p></div></details>';
    document.body.appendChild(root);
    const onAnswer = vi.fn();
    hydrateInlineChecks(root, onAnswer);
    hydrateInlineChecks(root, onAnswer); // idempotent

    expect(root.querySelectorAll('[role="radio"]')).toHaveLength(2);
    await user.click(screen.getByRole("radio", { name: /margin/ }));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    expect(root.textContent).toContain("Not quite — padding sits inside the border. Try again.");

    await user.click(screen.getByRole("radio", { name: /padding/ }));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    expect(root.textContent).toContain("Yes — padding sits inside the border.");
    expect(root.querySelector("details summary")?.className).toContain("cursor-pointer");
    root.remove();
  });
});

describe("extractFlashcards (review mode)", () => {
  it("builds cards from headings + following paragraphs and from definition lines", () => {
    const html =
      "<p>Specificity: a score that decides which conflicting rule wins, based on ids, classes and tags.</p>" +
      "<h2>CSS selectors</h2><p>A selector picks the elements a rule applies to, for example .card or #main.</p>" +
      "<h3>Too short</h3><p>x</p>"; // a heading with almost nothing under it makes no card
    const cards = extractFlashcards(html, "Week 2 note");
    expect(cards.map((c) => c.front)).toEqual(["CSS selectors", "Specificity"]);
    expect(cards[0].back).toContain("picks the elements");
    expect(cards[1].back).toContain("decides which conflicting rule wins");
    expect(cards[0].back).not.toContain("Too short");
    expect(cards[0].source).toBe("Week 2 note");
  });
});

describe("KnowledgeCheckCard", () => {
  beforeEach(() => post.mockReset());

  it("checks an answer server-side, shakes kindly on a miss, then submits the attempt", async () => {
    const user = userEvent.setup();
    post
      .mockResolvedValueOnce({ data: { data: { correct: false, correct_index: null, explanation: "look at the units." } } })
      .mockResolvedValueOnce({ data: { data: { correct: true, correct_index: 1, explanation: "" } } })
      .mockResolvedValueOnce({ data: { data: { correct: 1, total: 1, score_pct: 100, passed: true, just_completed: true } } });
    const onResult = vi.fn();
    render(<KnowledgeCheckCard itemId={9} questions={[{ id: "q1", type: "MCQ", prompt: "2 + 2 = ?", options: ["3", "4"] }]} onResult={onResult} />);

    await user.click(screen.getByRole("radio", { name: /3/ }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    expect(await screen.findByText("Not quite — look at the units. Try again.")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/elearning/my/items/9/knowledge-check/check", { question_id: "q1", answer_index: 0 });

    await user.click(screen.getByRole("radio", { name: /4/ }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    expect(await screen.findByText("Yes — that's it.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/elearning/my/items/9/knowledge-check", { answers: { q1: 1 } }));
    expect(await screen.findByText("All 1 right. That's a real skill now.")).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith({ score_pct: 100, passed: true, just_completed: true });
  });
});
