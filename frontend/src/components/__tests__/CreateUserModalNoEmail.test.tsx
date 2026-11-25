import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Create user: a student may be saved without an e-mail (they can't sign in); nobody else may. */

const api = vi.hoisted(() => ({
  getRoles: vi.fn(),
  createUser: vi.fn(),
  findUserElsewhere: vi.fn(),
  importUserFromSchool: vi.fn(),
}));
vi.mock("../../api/users", async (orig) => ({ ...(await orig<any>()), ...api }));

import { CreateUserModal } from "../CreateUserModal";

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.getRoles.mockResolvedValue([
    { role_id: 3, name: "TEACHER" },
    { role_id: 5, name: "STUDENT" },
  ]);
  api.createUser.mockResolvedValue({ user_id: 77, can_sign_in: false });
});

const fill = async (role: string) => {
  const user = userEvent.setup();
  render(<CreateUserModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
  await user.type(screen.getByPlaceholderText("Enter username"), "kid_one");
  await user.click(await screen.findByRole("button", { name: new RegExp(role) }));
  return user;
};

describe("CreateUserModal: no e-mail", () => {
  it("saves a student without an e-mail and says they can't sign in", async () => {
    const user = await fill("STUDENT");
    expect(screen.getByText(/Optional for students/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create User" }));
    await waitFor(() => expect(api.createUser).toHaveBeenCalled());
    expect(api.createUser.mock.calls[0][0]).toMatchObject({ username: "kid_one", email: undefined, roles: [5] });
  });

  it("still requires an e-mail for a teacher", async () => {
    const user = await fill("TEACHER");
    await user.click(screen.getByRole("button", { name: "Create User" }));
    expect(await screen.findByText(/Email is required \(only students may be added without one\)/)).toBeInTheDocument();
    expect(api.createUser).not.toHaveBeenCalled();
  });
});
