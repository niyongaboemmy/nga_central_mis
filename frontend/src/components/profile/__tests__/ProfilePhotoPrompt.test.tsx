import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

const uploadAvatarMock = vi.fn();
vi.mock("../../../api/users", () => ({
  uploadAvatar: (...a: any[]) => uploadAvatarMock(...a),
  uploadCover: vi.fn(),
  removeAvatar: vi.fn(),
}));

const refreshUserMock = vi.fn();
let mockUser: any;
vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: mockUser, refreshUser: refreshUserMock }),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("react-easy-crop", () => ({
  default: ({ onCropComplete }: any) => {
    React.useEffect(() => {
      onCropComplete({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 1, height: 1 });
    }, []);
    return <div data-testid="cropper" />;
  },
}));

import ProfilePhotoPrompt, { shouldPromptForPhoto, PHOTO_PROMPT_SNOOZE_DAYS } from "../ProfilePhotoPrompt";
import { ACTIVITY_NOTICE_ACK_EVENT } from "../../analytics/ActivityNotice";

const AVATAR = {
  version: 1790000000,
  sm: "https://api.example/avatars/7/1790000000/sm.webp?s=x",
  md: "https://api.example/avatars/7/1790000000/md.webp?s=x",
  lg: "https://api.example/avatars/7/1790000000/lg.webp?s=x",
};
const NOTICE_KEY = "nga.activityNotice.2026-10-01.7";

const renderAt = (path = "/home") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ProfilePhotoPrompt />
    </MemoryRouter>,
  );
const appear = () => act(() => { vi.advanceTimersByTime(3000); });

beforeAll(() => {
  (URL as any).createObjectURL = vi.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = vi.fn();
});

beforeEach(() => {
  // Timeouts and Date only: framer-motion animates on requestAnimationFrame.
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "Date"] });
  localStorage.clear();
  localStorage.setItem(NOTICE_KEY, "1");
  uploadAvatarMock.mockReset();
  refreshUserMock.mockReset().mockResolvedValue(undefined);
  showToastMock.mockReset();
  mockUser = {
    user: { user_id: 7, username: "jdoe", email: "j@x.rw" },
    profile: { first_name: "Jane", last_name: "Doe" },
    avatar: null,
  };
});
afterEach(() => vi.useRealTimers());

describe("shouldPromptForPhoto", () => {
  const base = { hasAvatar: false, noticeAcknowledged: true, snoozedUntil: 0, now: 1000, path: "/home" };
  it("asks people without a photo", () => expect(shouldPromptForPhoto(base)).toBe(true));
  it("never asks someone who has one", () => expect(shouldPromptForPhoto({ ...base, hasAvatar: true })).toBe(false));
  it("waits for the activity notice", () => expect(shouldPromptForPhoto({ ...base, noticeAcknowledged: false })).toBe(false));
  it("respects a snooze", () => {
    expect(shouldPromptForPhoto({ ...base, snoozedUntil: 2000 })).toBe(false);
    expect(shouldPromptForPhoto({ ...base, snoozedUntil: 999 })).toBe(true);
  });
  it("stays off the profile page", () => {
    expect(shouldPromptForPhoto({ ...base, path: "/profile" })).toBe(false);
    expect(shouldPromptForPhoto({ ...base, path: "/profiles-report" })).toBe(true);
  });
});

describe("ProfilePhotoPrompt", () => {
  it("appears shortly after sign-in for someone without a photo", async () => {
    renderAt();
    expect(screen.queryByRole("dialog", { name: /add a profile photo/i })).not.toBeInTheDocument();
    appear();
    expect(await screen.findByRole("dialog", { name: /add a profile photo/i })).toBeInTheDocument();
    expect(screen.getByText(/put a face to your name, jane/i)).toBeInTheDocument();
  });

  it("stays away for people who already have a photo", () => {
    mockUser.avatar = AVATAR;
    renderAt();
    appear();
    expect(screen.queryByRole("dialog", { name: /add a profile photo/i })).not.toBeInTheDocument();
  });

  it("waits until the activity notice is dismissed", async () => {
    localStorage.removeItem(NOTICE_KEY);
    renderAt();
    appear();
    expect(screen.queryByRole("dialog", { name: /add a profile photo/i })).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event(ACTIVITY_NOTICE_ACK_EVENT)); });
    expect(await screen.findByRole("dialog", { name: /add a profile photo/i })).toBeInTheDocument();
  });

  it("'Not now' hides it and snoozes it for a week", async () => {
    renderAt();
    appear();
    fireEvent.click(await screen.findByRole("button", { name: /not now/i }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /add a profile photo/i })).not.toBeInTheDocument());
    const until = Number(localStorage.getItem("nga.photoPrompt.snoozedUntil.7"));
    expect(until - Date.now()).toBeGreaterThan((PHOTO_PROMPT_SNOOZE_DAYS - 0.01) * 86_400_000);
  });

  it("the close button snoozes too, and a snoozed prompt doesn't come back on reload", async () => {
    const { unmount } = renderAt();
    appear();
    fireEvent.click(await screen.findByRole("button", { name: /^close$/i }));
    unmount();
    renderAt();
    appear();
    expect(screen.queryByRole("dialog", { name: /add a profile photo/i })).not.toBeInTheDocument();
  });

  it("adds a photo through the crop step and celebrates", async () => {
    uploadAvatarMock.mockResolvedValue(AVATAR);
    renderAt();
    appear();
    await screen.findByRole("dialog", { name: /add a profile photo/i });
    fireEvent.change(screen.getByTestId("photo-prompt-file-input"), {
      target: { files: [new File([new Uint8Array(100)], "me.png", { type: "image/png" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: /save picture/i }));

    expect(await screen.findByText(/looking great, jane/i)).toBeInTheDocument();
    expect(refreshUserMock).toHaveBeenCalled();
    expect(uploadAvatarMock.mock.calls[0][1]).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    act(() => { vi.advanceTimersByTime(4000); });
    await waitFor(() => expect(screen.queryByText(/looking great/i)).not.toBeInTheDocument());
  });

  it("accepts a photo dropped on the card, and rejects a non-image", async () => {
    renderAt();
    appear();
    const card = await screen.findByRole("dialog", { name: /add a profile photo/i });
    fireEvent.drop(card, { dataTransfer: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    expect(showToastMock).toHaveBeenCalledWith(expect.stringMatching(/image file/i), "error");
    fireEvent.drop(card, { dataTransfer: { files: [new File([new Uint8Array(10)], "a.png", { type: "image/png" })] } });
    expect(await screen.findByTestId("cropper")).toBeInTheDocument();
  });

  it("is never shown on the profile page", () => {
    renderAt("/profile");
    appear();
    expect(screen.queryByRole("dialog", { name: /add a profile photo/i })).not.toBeInTheDocument();
  });
});
