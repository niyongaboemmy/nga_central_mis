import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const uploadCoverMock = vi.fn();
const removeCoverMock = vi.fn();
vi.mock("../../../api/users", () => ({
  uploadAvatar: vi.fn(),
  uploadCover: (...a: any[]) => uploadCoverMock(...a),
  removeCover: (...a: any[]) => removeCoverMock(...a),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

let lastAspect: number | undefined;
vi.mock("react-easy-crop", () => ({
  default: ({ onCropComplete, aspect }: any) => {
    lastAspect = aspect;
    React.useEffect(() => {
      onCropComplete({ x: 0, y: 25, width: 100, height: 50 }, { x: 0, y: 0, width: 1, height: 1 });
    }, []);
    return <div data-testid="cropper" />;
  },
}));

import ProfileCover from "../ProfileCover";

const COVER = {
  version: 1790000000,
  md: "https://api.example/covers/7/1790000000/md.webp?s=x",
  lg: "https://api.example/covers/7/1790000000/lg.webp?s=x",
};

beforeAll(() => {
  (URL as any).createObjectURL = vi.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = vi.fn();
});
beforeEach(() => {
  uploadCoverMock.mockReset();
  removeCoverMock.mockReset();
  showToastMock.mockReset();
});

describe("ProfileCover", () => {
  it("is plain system blue when there is no cover", () => {
    render(<ProfileCover cover={null} />);
    const banner = screen.getByTestId("profile-cover");
    expect(banner.className).toContain("bg-blue-600");
    expect(banner.querySelector("img")).toBeNull();
    expect(banner.className).not.toMatch(/gradient/);
  });

  it("shows the cover image in both sizes", () => {
    render(<ProfileCover cover={COVER} />);
    const img = screen.getByTestId("profile-cover").querySelector("img")!;
    expect(img.getAttribute("src")).toBe(COVER.lg);
    expect(img.getAttribute("srcset")).toBe(`${COVER.md} 960w, ${COVER.lg} 1920w`);
  });

  it("has no controls unless it is your own profile", () => {
    render(<ProfileCover cover={COVER} />);
    expect(screen.queryByRole("button", { name: /cover/i })).not.toBeInTheDocument();
  });

  it("uploads a new cover through a 3:1 crop", async () => {
    uploadCoverMock.mockResolvedValue(COVER);
    const onChange = vi.fn();
    render(<ProfileCover cover={null} editable onChange={onChange} />);
    expect(screen.getByRole("button", { name: /add cover/i })).toBeInTheDocument();
    await userEvent.upload(screen.getByTestId("cover-file-input"), new File([new Uint8Array(50)], "c.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("Cover image")).toBeInTheDocument();
    expect(lastAspect).toBe(3);
    await userEvent.click(screen.getByRole("button", { name: /save picture/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(COVER));
    expect(uploadCoverMock.mock.calls[0][1]).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 });
    expect(showToastMock).toHaveBeenCalledWith("Cover image updated", "success");
  });

  it("removes the cover after confirming", async () => {
    removeCoverMock.mockResolvedValue(undefined);
    const onChange = vi.fn();
    render(<ProfileCover cover={COVER} editable onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /remove cover/i }));
    expect(await screen.findByText(/remove cover image\?/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });
});
