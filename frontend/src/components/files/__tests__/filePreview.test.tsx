import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KIND_BY_EXT, detectFileKind, formatBytes } from "../../../lib/files/fileKinds";
import { planPreview, PreviewManifest } from "../../../lib/files/previewPlan";
import FilePreview from "../FilePreview";

const m = (o: Partial<PreviewManifest>): PreviewManifest => ({
  name: "file.pdf",
  size: 1000,
  preview_status: "READY",
  variants: { pdf: false, thumb: false, text: false },
  ...o,
});

describe("file kinds", () => {
  it("matches the backend's table exactly (one source of truth for what is allowed)", () => {
    const src = readFileSync(path.resolve(__dirname, "../../../../../backend/src/services/files/fileKinds.ts"), "utf8");
    const body = /KIND_BY_EXT: Record<string, FileKind> = \{([\s\S]*?)\n\};/.exec(src)![1];
    const backend = Object.fromEntries([...body.matchAll(/(\w+): "(\w+)"/g)].map((x) => [x[1], x[2]]));
    expect(backend).toEqual(KIND_BY_EXT);
  });

  it("detects kinds and formats sizes", () => {
    expect(detectFileKind({ name: "Week 4 slides.PPTX" })).toBe("slides");
    expect(detectFileKind({ name: "x", mime: "image/png" })).toBe("image");
    expect(detectFileKind({ name: "movie.mp4" })).toBe("other");
    expect(formatBytes(2_500_000)).toBe("2.4 MB");
  });
});

describe("planPreview", () => {
  it("uses the server's PDF for office files when it exists", () => {
    expect(planPreview(m({ name: "deck.pptx", variants: { pdf: true, thumb: true, text: true } }))).toMatchObject({ strategy: "pdf-derivative", variant: "pdf" });
  });
  it("falls back in the browser while the PDF is prepared, and keeps checking", () => {
    expect(planPreview(m({ name: "a.docx", preview_status: "PENDING" }))).toMatchObject({ strategy: "docx-client", upgrading: true });
    expect(planPreview(m({ name: "a.xlsx", preview_status: "PROCESSING" }))).toMatchObject({ strategy: "sheet-client", upgrading: true });
    expect(planPreview(m({ name: "a.pptx", preview_status: "PENDING", variants: { pdf: false, thumb: false, text: true } }))).toMatchObject({ strategy: "slides-outline", variant: "text" });
  });
  it("without a converter, slides show their text and say why", () => {
    const p = planPreview(m({ name: "a.ppt", preview_status: "UNSUPPORTED", variants: { pdf: false, thumb: false, text: true } }));
    expect(p.strategy).toBe("slides-outline");
    expect(p.note).toMatch(/download/i);
  });
  it("asks before a big preview on a slow connection", () => {
    expect(planPreview(m({ name: "big.pdf", size: 20_000_000 }), { effectiveType: "2g" }).needsConfirm).toBe(true);
    expect(planPreview(m({ name: "big.pdf", size: 20_000_000 }), { effectiveType: "4g" }).needsConfirm).toBe(false);
  });
});

describe("<FilePreview>", () => {
  it("renders a CSV as a table and records that it was shown", async () => {
    const onShown = vi.fn();
    const loadVariant = vi.fn(async () => new Blob(['Name,Score\n"Uwase, A",9\nMugisha,7\n']));
    render(<FilePreview manifest={m({ name: "marks.csv" })} loadVariant={loadVariant} onDownload={vi.fn()} onShown={onShown} />);
    expect(await screen.findByText("Uwase, A")).toBeInTheDocument();
    expect(screen.getByText("Mugisha")).toBeInTheDocument();
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it("shows slide text with speaker notes and upgrades to the PDF when it's ready", async () => {
    const loadVariant = vi.fn(async (v: string) => new Blob([v === "text" ? "Slide 1\nColour wheel\nSpeaker notes: mix primaries\n\nSlide 2\nWarm colours" : "%PDF-1.4"]));
    let ready = false;
    const refreshManifest = vi.fn(async () => m({ name: "deck.pptx", preview_status: ready ? "READY" : "PENDING", variants: { pdf: ready, thumb: false, text: true } }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <FilePreview
        manifest={m({ name: "deck.pptx", preview_status: "PENDING", variants: { pdf: false, thumb: false, text: true } })}
        loadVariant={loadVariant}
        refreshManifest={refreshManifest}
        onDownload={vi.fn()}
      />,
    );
    expect(await screen.findByText("Colour wheel")).toBeInTheDocument();
    expect(screen.getByText("Speaker notes: mix primaries")).toBeInTheDocument();
    ready = true;
    await vi.advanceTimersByTimeAsync(3100);
    await waitFor(() => expect(loadVariant).toHaveBeenCalledWith("pdf"));
    vi.useRealTimers();
  });

  it("offers a download for files it can't show, and the button works", async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(<FilePreview manifest={m({ name: "bundle.zip", preview_status: "NOT_NEEDED" })} loadVariant={vi.fn()} onDownload={onDownload} />);
    expect(screen.getByText(/download it to open it/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download bundle.zip" }));
    expect(onDownload).toHaveBeenCalled();
  });

  it("never renders uploaded HTML — code files are shown as text", async () => {
    const loadVariant = vi.fn(async () => new Blob(['<img src=x onerror="alert(1)"><b>bold</b>']));
    const { container } = render(<FilePreview manifest={m({ name: "page.html" })} loadVariant={loadVariant} onDownload={vi.fn()} />);
    expect(await screen.findByText(/onerror/)).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
