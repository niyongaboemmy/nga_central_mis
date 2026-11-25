import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/** GAP-C: the verify page names the issuing school; an old-format QR asks for a re-print. */

vi.mock("../../services/api", () => ({ API_BASE_URL: "http://api.test" }));
import SchemeVerifyPage from "../SchemeVerifyPage";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify/:schemeId" element={<SchemeVerifyPage />} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => vi.unstubAllGlobals());

describe("GAP-C: scheme verification page", () => {
  it("GAP-C: a verified document shows the issuing school prominently", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve({ valid: true, scheme_id: 5, school_name: "Green Hills School", subject_name: "Maths", validation_status: "APPROVED" }) }));
    renderAt("/verify/5?t=2&s=abc");
    const block = await screen.findByTestId("issuing-school");
    expect(block).toHaveTextContent("Issuing school");
    expect(block).toHaveTextContent("Green Hills School");
    expect(fetch).toHaveBeenCalledWith("http://api.test/scheme-of-work/verify/5?t=2&s=abc", { credentials: "omit" });
  });

  it("GAP-C: an old-format QR for a newer document asks for a re-printed copy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve({ valid: false, code: "QR_FORMAT_OUTDATED", message: "This QR code is from an older format; ask the school for a re-printed copy." }) }));
    renderAt("/verify/5");
    expect(await screen.findByText("Older QR code")).toBeInTheDocument();
    expect(screen.getByText(/ask the school for a re-printed copy/)).toBeInTheDocument();
    expect(screen.queryByText("Document Verified")).toBeNull();
  });
});
