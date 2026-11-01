import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HandoffControl, { PREFILL_MAX, handoffLink } from "../HandoffControl";
import { rememberAiPolicy, type AiPolicyView } from "../../../api/aiPolicy";
import { AiAnsweredBy } from "../AiSourceControl";
import { MemoryRouter } from "react-router-dom";

const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../services/api", () => ({
  default: { get: vi.fn(() => Promise.reject(new Error("no network in tests"))) },
  ToastStore: { getShowToast: () => toast },
}));

const policyView = (external: { handoff: boolean; pupilConsent: boolean }) =>
  ({ policy: { enabled: true, apps: {} }, me: { hasAiUse: true, canManage: false, external } }) as unknown as AiPolicyView;

let open: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  rememberAiPolicy(policyView({ handoff: true, pupilConsent: true }));
  open = vi.fn();
  vi.stubGlobal("open", open);
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  toast.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const httpError = (status: number, body: Record<string, unknown>) => Object.assign(new Error("HTTP"), { response: { status, data: body } });

describe("HandoffControl", () => {
  it("is hidden unless hand-off is available to this person", () => {
    rememberAiPolicy(policyView({ handoff: false, pupilConsent: false }));
    const { container } = render(<HandoffControl run={vi.fn()} onImported={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for the prompt, opens Claude prefilled in a new tab without sending, then imports a pasted answer", async () => {
    const run = vi.fn((extra: any) =>
      Promise.resolve(
        extra.aiHandoff.mode === "prompt"
          ? { success: true, handoff: { prompt: "Write a plan & more", expects: "json" } }
          : { success: true, data: { topic: "Variables", ai: { route: "handoff" } } },
      ),
    );
    const onImported = vi.fn();
    render(<HandoffControl run={run} onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: /Open in my AI/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Claude/ }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(run).toHaveBeenCalledWith({ aiHandoff: { mode: "prompt", pupilConsent: false } });
    expect(open).toHaveBeenCalledWith(`https://claude.ai/new?q=${encodeURIComponent("Write a plan & more")}`, "_blank", "noopener,noreferrer");
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/Claude opened with the prompt/);

    fireEvent.change(screen.getByLabelText("Paste the answer"), { target: { value: '```json\n{"topic":"Variables"}\n```' } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith({ success: true, data: { topic: "Variables", ai: { route: "handoff" } } }));
    expect(run).toHaveBeenLastCalledWith({ aiHandoff: { mode: "import", text: '```json\n{"topic":"Variables"}\n```' } });
    expect(screen.queryByLabelText("Paste the answer")).toBeNull();
  });

  it("copies for Gemini (no prefill) and for prompts too long for a link", async () => {
    const long = "x".repeat(PREFILL_MAX + 1);
    const run = vi.fn().mockResolvedValueOnce({ handoff: { prompt: "Short" } }).mockResolvedValueOnce({ data: { handoff: { prompt: long } } });
    render(<HandoffControl run={run} onImported={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Open in my AI/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Gemini/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://gemini.google.com/app", "_blank", "noopener,noreferrer"));
    expect(writeText).toHaveBeenCalledWith("Short");
    expect(toast).toHaveBeenCalledWith("Prompt copied — paste it in", "success");

    fireEvent.click(screen.getByRole("button", { name: /Open in my AI/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ChatGPT/ }));
    await waitFor(() => expect(open).toHaveBeenLastCalledWith("https://chatgpt.com/", "_blank", "noopener,noreferrer"));
    expect(writeText).toHaveBeenLastCalledWith(long);
  });

  it("shows server refusals and a bad paste inline", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(httpError(403, { code: "AI_HANDOFF_OFF", message: "off" }))
      .mockRejectedValueOnce(httpError(400, { message: "The pasted answer isn't in the expected format." }));
    const onImported = vi.fn();
    render(<HandoffControl run={run} onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: /Open in my AI/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy prompt/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Open in my AI is turned off for the school.");
    expect(open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Paste the answer/ }));
    fireEvent.change(screen.getByLabelText("Paste the answer"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/expected format/);
    expect(onImported).not.toHaveBeenCalled();
  });

  it("pupil data: an unticked consent box; ticking it sends pupilConsent", async () => {
    const run = vi.fn().mockRejectedValueOnce(httpError(403, { code: "AI_HANDOFF_PUPIL_CONSENT", message: 'Tick "Include pupil details" first.' })).mockResolvedValue({ handoff: { prompt: "Mentee" } });
    render(<HandoffControl pupilData run={run} onImported={vi.fn()} />);

    const box = screen.getByRole("checkbox", { name: "Include pupil details" });
    expect(box).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Open in my AI/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ChatGPT/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Include pupil details/);
    expect(run).toHaveBeenLastCalledWith({ aiHandoff: { mode: "prompt", pupilConsent: false } });

    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /Open in my AI/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ChatGPT/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(`https://chatgpt.com/?q=Mentee`, "_blank", "noopener,noreferrer"));
    expect(run).toHaveBeenLastCalledWith({ aiHandoff: { mode: "prompt", pupilConsent: true } });
  });

  it("pupil data is not offered when the school says never", () => {
    rememberAiPolicy(policyView({ handoff: true, pupilConsent: false }));
    const { container } = render(<HandoffControl pupilData run={vi.fn()} onImported={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links: prefilled up to the limit, plain site after it", () => {
    expect(handoffLink("claude", "a b")).toEqual({ url: "https://claude.ai/new?q=a%20b", prefilled: true });
    expect(handoffLink("gemini", "a")).toEqual({ url: "https://gemini.google.com/app", prefilled: false });
    expect(handoffLink("copy", "a")).toEqual({ url: null, prefilled: false });
    expect(handoffLink("chatgpt", "y".repeat(PREFILL_MAX)).prefilled).toBe(true);
  });

  it("a pasted answer reads 'via your own AI (pasted)'", () => {
    render(
      <MemoryRouter>
        <AiAnsweredBy ai={{ route: "handoff", reason: "HANDOFF" as any }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("via your own AI (pasted)");
  });
});
