import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const uploadAvatarMock = vi.fn();
const removeAvatarMock = vi.fn();
vi.mock("../../../api/users", () => ({
  uploadAvatar: (...args: any[]) => uploadAvatarMock(...args),
  removeAvatar: (...args: any[]) => removeAvatarMock(...args),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

// jsdom has no layout, so the real cropper never reports an area. This stand-in reports
// the right half of the picture (react-easy-crop's percentage format) as soon as it mounts.
vi.mock("react-easy-crop", () => ({
  default: ({ onCropComplete }: any) => {
    React.useEffect(() => {
      onCropComplete({ x: 50, y: 0, width: 50, height: 100 }, { x: 0, y: 0, width: 1, height: 1 });
    }, []);
    return <div data-testid="cropper" />;
  },
}));

import AvatarControl from "../AvatarControl";
import { checkAvatarFile, toAvatarCrop } from "../ProfilePictureEditor";

const AVATAR = {
  version: 1790000000,
  sm: "https://api.example/avatars/7/1790000000/sm.webp?s=x",
  md: "https://api.example/avatars/7/1790000000/md.webp?s=x",
  lg: "https://api.example/avatars/7/1790000000/lg.webp?s=x",
};

const png = (bytes = 1000, type = "image/png", name = "me.png") => new File([new Uint8Array(bytes)], name, { type });

beforeAll(() => {
  // jsdom lacks object URLs.
  (URL as any).createObjectURL = vi.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = vi.fn();
});

beforeEach(() => {
  uploadAvatarMock.mockReset();
  removeAvatarMock.mockReset();
  showToastMock.mockReset();
});

describe("avatar file checks", () => {
  it("accepts pictures up to 10 MB", () => {
    expect(checkAvatarFile(png())).toBeNull();
    expect(checkAvatarFile(png(1000, "image/jpeg", "a.jpg"))).toBeNull();
  });

  it("rejects non-images, HEIC and files over 10 MB", () => {
    expect(checkAvatarFile(png(10, "application/pdf", "a.pdf"))).toMatch(/image file/);
    expect(checkAvatarFile(png(10, "image/heic", "a.heic"))).toMatch(/HEIC/);
    expect(checkAvatarFile(png(10 * 1024 * 1024 + 1))).toMatch(/10 MB/);
  });

  it("turns the cropper's percentages into clamped fractions", () => {
    expect(toAvatarCrop({ x: 25, y: 10, width: 50, height: 50 })).toEqual({ x: 0.25, y: 0.1, width: 0.5, height: 0.5 });
    // Rounding can push the box a hair outside the picture; it is pulled back in.
    expect(toAvatarCrop({ x: 60, y: -0.2, width: 40.3, height: 100.4 })).toEqual({ x: 0.6, y: 0, width: 0.4, height: 1 });
  });
});

describe("AvatarControl", () => {
  it("crops and uploads a chosen picture, then reports the new avatar", async () => {
    uploadAvatarMock.mockResolvedValue(AVATAR);
    const onChange = vi.fn();
    render(<AvatarControl name="Jane Doe" avatar={null} onChange={onChange} />);

    expect(screen.getByRole("button", { name: /add a profile picture/i })).toBeInTheDocument();
    await userEvent.upload(screen.getByTestId("avatar-file-input"), png());

    expect(await screen.findByTestId("cropper")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /save picture/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(AVATAR));
    const [file, crop, opts] = uploadAvatarMock.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(crop).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(opts.userId).toBeUndefined();
    expect(showToastMock).toHaveBeenCalledWith("Profile picture updated", "success");
    await waitFor(() => expect(screen.queryByTestId("cropper")).not.toBeInTheDocument());
  });

  it("uploads to another user's picture when given a userId", async () => {
    uploadAvatarMock.mockResolvedValue(AVATAR);
    render(<AvatarControl name="Jane Doe" avatar={null} userId={42} onChange={vi.fn()} />);
    await userEvent.upload(screen.getByTestId("avatar-file-input"), png());
    await userEvent.click(await screen.findByRole("button", { name: /save picture/i }));
    await waitFor(() => expect(uploadAvatarMock).toHaveBeenCalled());
    expect(uploadAvatarMock.mock.calls[0][2].userId).toBe(42);
  });

  it("keeps the dialog open and shows the server's message when the upload fails", async () => {
    uploadAvatarMock.mockRejectedValue({ response: { data: { message: "That picture is too large." } } });
    const onChange = vi.fn();
    render(<AvatarControl name="Jane Doe" avatar={null} onChange={onChange} />);
    await userEvent.upload(screen.getByTestId("avatar-file-input"), png());
    await userEvent.click(await screen.findByRole("button", { name: /save picture/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That picture is too large.");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("cropper")).toBeInTheDocument();
  });

  it("refuses a bad file before opening the editor", async () => {
    render(<AvatarControl name="Jane Doe" avatar={null} onChange={vi.fn()} />);
    const input = screen.getByTestId("avatar-file-input");
    fireEvent.change(input, { target: { files: [png(10 * 1024 * 1024 + 1)] } });
    expect(showToastMock).toHaveBeenCalledWith(expect.stringMatching(/10 MB/), "error");
    expect(screen.queryByTestId("cropper")).not.toBeInTheDocument();
  });

  it("accepts a picture dropped on the avatar", async () => {
    render(<AvatarControl name="Jane Doe" avatar={null} onChange={vi.fn()} />);
    fireEvent.drop(screen.getByRole("button", { name: /add a profile picture/i }), {
      dataTransfer: { files: [png()] },
    });
    expect(await screen.findByTestId("cropper")).toBeInTheDocument();
  });

  it("removes the picture after confirmation", async () => {
    removeAvatarMock.mockResolvedValue(undefined);
    const onChange = vi.fn();
    render(<AvatarControl name="Jane Doe" avatar={AVATAR} onChange={onChange} />);
    expect(screen.getByRole("img", { name: "Jane Doe" }).getAttribute("src")).toBe(AVATAR.md);

    await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(await screen.findByText(/remove profile picture\?/i)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /^remove$/i });
    await userEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(removeAvatarMock).toHaveBeenCalledWith({ userId: undefined });
  });
});
