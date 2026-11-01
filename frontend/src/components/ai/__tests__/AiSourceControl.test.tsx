import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AiSourceControl, { AiAnsweredBy, forgetResolved } from "../AiSourceControl";

const get = vi.hoisted(() => vi.fn());
vi.mock("../../../services/api", () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

const resolved = (over: Record<string, unknown> = {}) => ({
  data: {
    success: true,
    data: {
      v: 1,
      policyV: 3,
      enabled: true,
      byTask: { author: { route: "personal", reason: "PERSONAL", credentialId: 7, provider: "anthropic", model: "claude-haiku-5-5", label: "Claude" } },
      choices: [{ credentialId: 7, provider: "anthropic", model: "claude-haiku-5-5", label: "Claude" }],
      ...over,
    },
  },
});

beforeEach(() => {
  get.mockReset();
  forgetResolved();
});

const renderIt = (onChange = vi.fn()) =>
  render(
    <MemoryRouter>
      <AiSourceControl task="author" value="" onChange={onChange} />
    </MemoryRouter>,
  );

describe("AiSourceControl", () => {
  it("renders nothing for people without usable keys", async () => {
    get.mockResolvedValue(resolved({ choices: [] }));
    const { container } = renderIt();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/my-ai/resolved"));
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the default, School AI and my keys, and reports the choice as aiRoute", async () => {
    get.mockResolvedValue(resolved());
    const onChange = vi.fn();
    renderIt(onChange);
    const select = await screen.findByLabelText(/Answers with/, { selector: "select" });
    expect(screen.getByRole("link", { name: /Manage My AI/ })).toHaveAttribute("href", "/my-ai");
    const options = Array.from((select as HTMLSelectElement).options).map((o) => [o.value, o.text]);
    expect(options).toEqual([
      ["", "My AI default (Claude · claude-haiku-5-5)"],
      ["school", "School AI (free)"],
      ["7:claude-haiku-5-5", "My Claude"],
    ]);
    await userEvent.selectOptions(select, "school");
    expect(onChange).toHaveBeenCalledWith("school");
  });

  it("fetches the route map once for every panel on the page", async () => {
    get.mockResolvedValue(resolved());
    render(
      <MemoryRouter>
        <AiSourceControl task="author" value="" onChange={vi.fn()} />
        <AiSourceControl task="assist" value="" onChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(await screen.findAllByLabelText(/Answers with/, { selector: "select" })).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("AiAnsweredBy", () => {
  it("names my key, explains a fallback, and stays quiet for plain School AI", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AiAnsweredBy ai={{ route: "personal", label: "Claude", model: "claude-haiku-5-5" }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("via My Claude · claude-haiku-5-5");

    rerender(
      <MemoryRouter>
        <AiAnsweredBy ai={{ route: "school", reason: "KEY_NOT_ACTIVE", fallbackFrom: "AI_KEY_NO_CREDIT" }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Your key was out of credit; School AI answered.");
    expect(screen.getByRole("link", { name: "Fix in My AI" })).toHaveAttribute("href", "/my-ai");

    rerender(
      <MemoryRouter>
        <AiAnsweredBy ai={{ route: "school", reason: "NO_ROUTE" }} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
