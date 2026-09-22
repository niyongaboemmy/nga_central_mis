import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { flushQueue, queuedCount, sendOrQueue } from "../learner/offline";
import AITutorSheet from "../learner/AITutorSheet";

const post = vi.fn();
const get = vi.fn();
vi.mock("../../../services/api", () => ({ apiService: { post: (...a: any[]) => post(...a), get: (...a: any[]) => get(...a) } }));

describe("offline queue", () => {
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
  });

  it("queues progress actions while offline and replays them in order when back online", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(await sendOrQueue("/elearning/my/items/1/done")).toBe(false);
    expect(await sendOrQueue("/elearning/my/items/1/heartbeat", { seconds: 30 })).toBe(false);
    expect(queuedCount()).toBe(2);
    expect(post).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    post.mockResolvedValue({});
    expect(await flushQueue()).toBe(2);
    expect(post.mock.calls.map((c) => c[0])).toEqual(["/elearning/my/items/1/done", "/elearning/my/items/1/heartbeat"]);
    expect(queuedCount()).toBe(0);
  });

  it("queues on a network failure but not on a server answer; a 4xx is dropped on replay", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    post.mockRejectedValueOnce(new Error("Network Error"));
    expect(await sendOrQueue("/elearning/my/items/2/done")).toBe(false);
    expect(queuedCount()).toBe(1);
    post.mockRejectedValueOnce({ response: { status: 400 } });
    await expect(sendOrQueue("/elearning/my/items/3/done")).rejects.toBeTruthy();
    expect(queuedCount()).toBe(1);
    post.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await flushQueue()).toBe(0);
    expect(queuedCount()).toBe(0);
  });
});

describe("AITutorSheet", () => {
  it("offers suggested questions and shows a cited, grounded answer", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: { data: { questions: ["Quiz me on this week"] } } });
    post.mockResolvedValue({
      data: { data: { answer_html: "<p>Flexbox lays items out on one axis.</p>", grounded: true, citations: [{ item_id: 7, title: "Flexbox basics", section_id: 1 }], follow_ups: ["What is justify-content?"] } },
    });
    render(
      <MemoryRouter>
        <AITutorSheet courseId={3} sectionId={1} open onClose={() => undefined} />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: /Quiz me on this week/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/elearning/my/courses/3/ask", { question: "Quiz me on this week", section_id: 1, mode: "quiz" }));
    expect(await screen.findByText("Flexbox lays items out on one axis.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Flexbox basics/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What is justify-content?" })).toBeInTheDocument();
  });
});
