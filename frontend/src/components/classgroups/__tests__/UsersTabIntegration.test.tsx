import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The workspace itself is exercised in the other files here; this one is only
// about how the Users page mounts it.
// Counts mounts, not renders -- the claim under test is that the tab is
// mounted lazily and then never unmounted, and a render count would also move
// on every unrelated re-render of the page.
const workspaceMounted = vi.fn();
vi.mock("../ClassGroupsManagement", () => ({
  default: () => {
    React.useEffect(() => {
      workspaceMounted();
    }, []);
    return <div>class groups workspace</div>;
  },
}));

vi.mock("../../../api/users", () => ({
  getRoles: vi.fn(async () => []),
}));
vi.mock("../../UsersManagement", () => ({
  default: () => <div>management panel</div>,
}));
vi.mock("../../UsersDashboard", () => ({
  default: () => <div>dashboard panel</div>,
}));

const userWithPermission = {
  roles: [{ permissions: [{ name: "MANAGE_USERS" }] }],
};
let currentUser: any = userWithPermission;
vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: currentUser }),
}));

import Users from "../../Users";

describe("Users page — Class Groups Management tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = userWithPermission;
  });

  it("offers the third tab alongside Management and Dashboard", async () => {
    render(<Users />);

    expect(
      await screen.findByRole("tab", { name: "Class Groups Management" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Management" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("does not mount the workspace until the tab is first opened", async () => {
    const user = userEvent.setup();
    render(<Users />);

    // It is heavy (class tree + enrollment matrix), so it is lazy and
    // code-split rather than mounted upfront like the other two tabs.
    expect(workspaceMounted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Class Groups Management" }));

    expect(await screen.findByText("class groups workspace")).toBeInTheDocument();
    expect(workspaceMounted).toHaveBeenCalled();
  });

  it("keeps the workspace mounted after switching away, so its state survives", async () => {
    const user = userEvent.setup();
    render(<Users />);

    await user.click(screen.getByRole("tab", { name: "Class Groups Management" }));
    await screen.findByText("class groups workspace");
    expect(workspaceMounted).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "Management" }));
    await user.click(screen.getByRole("tab", { name: "Class Groups Management" }));

    // Hidden, never unmounted — so no refetch and no lost selection.
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Class Groups Management" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(workspaceMounted).toHaveBeenCalledTimes(1);
  });

  it("stays behind the page's existing permission gate", async () => {
    currentUser = { roles: [{ permissions: [{ name: "VIEW_REPORTS" }] }] };
    render(<Users />);

    expect(await screen.findByText("Access Denied")).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Class Groups Management" }),
    ).not.toBeInTheDocument();
  });
});
