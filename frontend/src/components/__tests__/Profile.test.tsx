import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateProfileMock = vi.fn();
vi.mock("../../api/users", () => ({
  updateProfile: (...args: any[]) => updateProfileMock(...args),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  uploadCover: vi.fn(),
  removeCover: vi.fn(),
}));

const refreshUserMock = vi.fn();
let mockUser: any;
vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: mockUser, refreshUser: refreshUserMock }),
}));

const showToastMock = vi.fn();
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

// Its own form and API calls are covered elsewhere; here it only needs to open.
vi.mock("../ChangePasswordModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog">Change password form</div> : null),
}));

import Profile from "../Profile";

const AVATAR = {
  version: 1790000000,
  sm: "https://api.example/avatars/7/1790000000/sm.webp?s=x",
  md: "https://api.example/avatars/7/1790000000/md.webp?s=x",
  lg: "https://api.example/avatars/7/1790000000/lg.webp?s=x",
};

beforeEach(() => {
  updateProfileMock.mockReset().mockResolvedValue({});
  refreshUserMock.mockReset().mockResolvedValue(undefined);
  showToastMock.mockReset();
  mockUser = {
    user: {
      user_id: 7,
      username: "jdoe",
      email: "jane.doe@example.com",
      phone_number: "0788000000",
      status: "ACTIVE",
      created_at: "2025-01-15T08:00:00.000Z",
      updated_at: "2025-01-15T08:00:00.000Z",
      avatar_url: AVATAR.md,
    },
    profile: {
      profile_id: 1,
      user_id: 7,
      first_name: "Jane",
      last_name: "Doe",
      gender: "FEMALE",
      date_of_birth: "2009-04-12T00:00:00.000Z",
      address: "Kicukiro",
      user_type: "STUDENT",
      registration_number: "NGA-2025-0042",
    },
    avatar: AVATAR,
    roles: [{ role_id: 3, name: "STUDENT" }],
  };
});

describe("Profile page", () => {
  it("shows the profile picture, identity and account details", () => {
    render(<Profile />);
    expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
    const picture = screen.getByRole("img", { name: "Jane Doe" }) as HTMLImageElement;
    expect(picture.getAttribute("src")).toBe(AVATAR.md);
    expect(screen.getByRole("button", { name: /change profile picture/i })).toBeInTheDocument();
    expect(screen.getByText("NGA-2025-0042")).toBeInTheDocument();
    expect(screen.getByText(/@jdoe/)).toBeInTheDocument();
    expect(screen.getByText(/Task Mentor, Tendo and Tupo/)).toBeInTheDocument();
  });

  it("shows the cover, or plain system blue without one", () => {
    const COVER = { version: 1, md: "https://api.example/covers/7/1/md.webp?s=x", lg: "https://api.example/covers/7/1/lg.webp?s=x" };
    const { unmount } = render(<Profile />);
    expect(screen.getByTestId("profile-cover").className).toContain("bg-blue-600");
    expect(screen.getByRole("button", { name: /add cover/i })).toBeInTheDocument();
    unmount();
    mockUser = { ...mockUser, cover: COVER };
    render(<Profile />);
    expect(screen.getByTestId("profile-cover").querySelector("img")?.getAttribute("src")).toBe(COVER.lg);
    expect(screen.getByRole("button", { name: /change cover/i })).toBeInTheDocument();
  });

  it("offers to add a picture when there is none", () => {
    mockUser = { ...mockUser, avatar: null, user: { ...mockUser.user, avatar_url: null } };
    render(<Profile />);
    expect(screen.getByRole("button", { name: /add a profile picture/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload photo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove$/i })).not.toBeInTheDocument();
  });

  it("fills the form from the profile, with the date in input format", () => {
    render(<Profile />);
    expect(screen.getByLabelText("First name")).toHaveValue("Jane");
    expect(screen.getByLabelText("Date of birth")).toHaveValue("2009-04-12");
    expect(screen.getByLabelText("Address")).toHaveValue("Kicukiro");
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("saves only the fields that changed, then refreshes the session", async () => {
    render(<Profile />);
    const address = screen.getByLabelText("Address");
    await userEvent.clear(address);
    await userEvent.type(address, "Remera, Gasabo");
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith({ address: "Remera, Gasabo" }));
    expect(refreshUserMock).toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith("Profile updated", "success");
  });

  it("discards edits", async () => {
    render(<Profile />);
    const first = screen.getByLabelText("First name");
    await userEvent.type(first, "x");
    await userEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(first).toHaveValue("Jane");
    await waitFor(() => expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument());
  });

  it("will not save an empty name", async () => {
    render(<Profile />);
    await userEvent.clear(screen.getByLabelText("Last name"));
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(expect.stringMatching(/required/), "error");
  });

  it("opens the change-password dialog", async () => {
    render(<Profile />);
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Change password form");
  });
});
