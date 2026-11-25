import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Create user: someone already in another school is added here with a role of this school. */

const api = vi.hoisted(() => ({
  getRoles: vi.fn(),
  createUser: vi.fn(),
  findUserElsewhere: vi.fn(),
  importUserFromSchool: vi.fn(),
}));
vi.mock("../../api/users", async (orig) => ({ ...(await orig<any>()), ...api }));

import { CreateUserModal } from "../CreateUserModal";

const GRACE = {
  tid: 1,
  schoolName: "New Generation Academy",
  userId: 41,
  name: "Grace Mutoni",
  email: "grace@two.test",
  username: "grace",
  phone: "••••••456",
  userType: "TEACHER",
  roles: ["TEACHER"],
  alreadyInTarget: false,
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.getRoles.mockResolvedValue([
    { role_id: 3, name: "TEACHER" },
    { role_id: 4, name: "ACCOUNTANT" },
  ]);
});

describe("CreateUserModal: already in another school", () => {
  it("finds the person and adds them with the chosen role", async () => {
    api.findUserElsewhere.mockResolvedValue([GRACE]);
    api.importUserFromSchool.mockResolvedValue({ userId: 90, username: "grace", roles: ["ACCOUNTANT"] });
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateUserModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText("E-mail or username in another school"), "grace@two.test");
    await user.click(screen.getByRole("button", { name: /Find/ }));
    expect(await screen.findByText("Grace Mutoni")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to this school" }));
    // New-account fields are gone; roles stay.
    expect(screen.queryByPlaceholderText("Enter username")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "ACCOUNTANT" }));
    await user.click(screen.getByRole("button", { name: /Add to this school/ }));
    await waitFor(() => expect(api.importUserFromSchool).toHaveBeenCalledWith({ identifier: "grace@two.test", sourceTid: 1, roles: [4] }));
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ user_id: 90 }));
    expect(api.createUser).not.toHaveBeenCalled();
  });

  it("checks the e-mail typed for a new account and offers the existing person", async () => {
    api.findUserElsewhere.mockResolvedValue([GRACE]);
    const user = userEvent.setup();
    render(<CreateUserModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Enter email"), "grace@two.test");
    await user.tab();
    await waitFor(() => expect(api.findUserElsewhere).toHaveBeenCalledWith("grace@two.test"));
    await user.click(await screen.findByRole("button", { name: "Add them instead" }));
    expect(screen.getByText(/From New Generation Academy/)).toBeInTheDocument();
  });
});
