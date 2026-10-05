import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import UpdateBanner from "../UpdateBanner";

const boot = (entry: string) => {
  const s = document.createElement("script");
  s.type = "module";
  s.src = `/assets/${entry}`;
  document.head.appendChild(s);
  return s;
};

describe("UpdateBanner", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers a reload once the server serves a newer bundle", async () => {
    const script = boot("index-OLD111.js");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<script type="module" src="/assets/index-NEW222.js"></script>') }));
    render(<UpdateBanner enabled />);
    expect(await screen.findByText("A new version of NGA MIS is available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    script.remove();
  });

  it("stays quiet while the bundle is current", async () => {
    const script = boot("index-SAME.js");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<script type="module" src="/assets/index-SAME.js"></script>') });
    vi.stubGlobal("fetch", fetchMock);
    render(<UpdateBanner enabled />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    script.remove();
  });
});
