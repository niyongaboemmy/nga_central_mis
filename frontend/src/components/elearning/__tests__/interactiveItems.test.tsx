import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const post = vi.fn();
vi.mock("../../../services/api", () => ({ apiService: { post: (...a: any[]) => post(...a), get: vi.fn() }, API_BASE_URL: "http://api" }));
const queued = vi.fn(async () => true);
vi.mock("../learner/offline", () => ({ sendOrQueue: (...a: any[]) => queued(...(a as [])) }));

import { ExitTicketCard, FlashcardDeck, PracticalTaskView } from "../learner/InteractiveItems";

describe("learner interactive items", () => {
  beforeEach(() => {
    post.mockReset();
    queued.mockClear();
  });

  it("exit ticket: needs every answer and a confidence, then shows the keys", async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: { data: { correct: 1, total: 1, keys: [{ id: "q1", correct_index: 0, explanation: "Brown is live." }] } } });
    render(<ExitTicketCard itemId={7} content={{ questions: [{ id: "q1", type: "MCQ", prompt: "Which wire is live?", options: ["Brown", "Blue"] }], ask_confidence: true, submitted: null }} />);
    const send = screen.getByRole("button", { name: "Send to my teacher" });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Brown" }));
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Very sure/ }));
    await user.click(send);
    expect(post).toHaveBeenCalledWith("/elearning/my/items/7/exit-ticket", { answers: { q1: 0 }, confidence: 3 });
    expect(await screen.findByText(/1 of 1 right/)).toBeInTheDocument();
    expect(screen.getByText(/Brown is live/)).toBeInTheDocument();
  });

  it("flashcards: flip, grade, and the review is saved (or queued offline)", async () => {
    const user = userEvent.setup();
    render(<FlashcardDeck itemId={9} content={{ cards: [{ id: "a", front: "Live", back: "Brown wire" }], reviews: [] }} />);
    await user.click(screen.getByRole("button", { name: /Live\. Tap to see the answer/ }));
    expect(await screen.findByText("Brown wire")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Good/ }));
    expect(queued).toHaveBeenCalledWith("/elearning/my/items/9/flashcards/review", expect.objectContaining({ card_id: "a", rating: 3 }));
    expect(await screen.findByText(/Deck done — 1 card reviewed/)).toBeInTheDocument();
  });

  it("practical task: shows the checklist and the teacher's verdict; no upload once signed off", () => {
    render(
      <PracticalTaskView
        itemId={11}
        content={{
          brief_html: "<p>Wire a lamp.</p>",
          checklist: [{ id: "k1", text: "Live goes through the switch", criteria_number: "1.1" }],
          max_photos: 3,
          submission: { status: "SIGNED_OFF", checklist_result: { k1: true }, teacher_comment: "Neat work", photos: [] },
        }}
      />,
    );
    expect(screen.getByText("Signed off ✓")).toBeInTheDocument();
    expect(screen.getByText("Neat work")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull();
  });

  it("practical task: sending needs at least one photo", async () => {
    const user = userEvent.setup();
    render(<PracticalTaskView itemId={11} content={{ checklist: [{ id: "k1", text: "Tight terminals" }], max_photos: 2, submission: null }} />);
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "work.png", { type: "image/png" }));
    expect(screen.getByRole("button", { name: /Send 1 photo/ })).toBeEnabled();
  });
});
