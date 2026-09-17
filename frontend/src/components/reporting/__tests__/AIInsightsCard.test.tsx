import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIInsightsCard from "../AIInsightsCard";

const generateMenteeAIInsightsMock = vi.fn((_studentId: number) =>
  Promise.resolve({
    data: {
      data: {
        student_id: 1,
        generated_at: "2026-02-01T00:00:00.000Z",
        summary: "Ada is progressing well overall.",
        strengths: ["Consistent assignment completion"],
        concerns: ["Recent stress flag in last session"],
        recommended_focus: "Check in on workload balance.",
        based_on_sessions: 4,
      },
    },
  }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      generateMenteeAIInsights: (studentId: number) => generateMenteeAIInsightsMock(studentId),
    },
  };
});

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("AIInsightsCard", () => {
  beforeEach(() => {
    generateMenteeAIInsightsMock.mockClear();
    showToastMock.mockClear();
  });

  it("shows a prompt before anything is generated", () => {
    render(<AIInsightsCard studentId={1} />);
    expect(screen.getByText(/Ask AI to summarize/i)).toBeInTheDocument();
  });

  it("generates and displays insights on click", async () => {
    const user = userEvent.setup();
    render(<AIInsightsCard studentId={1} />);

    await user.click(screen.getByRole("button", { name: /Generate/i }));

    await waitFor(() => expect(generateMenteeAIInsightsMock).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Ada is progressing well overall.")).toBeInTheDocument();
    expect(screen.getByText(/Consistent assignment completion/)).toBeInTheDocument();
    expect(screen.getByText(/Recent stress flag in last session/)).toBeInTheDocument();
    expect(screen.getByText("Check in on workload balance.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeInTheDocument();
  });

  it("shows the error message when generation fails (e.g. no sessions yet)", async () => {
    const user = userEvent.setup();
    generateMenteeAIInsightsMock.mockRejectedValueOnce({
      response: { data: { message: "No mentorship sessions logged yet for this mentee." } },
    });
    render(<AIInsightsCard studentId={1} />);

    await user.click(screen.getByRole("button", { name: /Generate/i }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(
        "No mentorship sessions logged yet for this mentee.",
        "error",
      ),
    );
  });
});
