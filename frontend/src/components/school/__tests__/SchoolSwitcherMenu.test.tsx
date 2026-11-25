import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** The school switcher in menus: expands in place, reads well, and its confirm survives the menu closing. */

const A = { tid: 1, slug: "nga", name: "NGA Cambridge Program", logoUrl: null, status: "ACTIVE", current: true, roles: ["ADMIN"] };
const B = { tid: 2, slug: "ngca", name: "New Generation Coding Academy of Kigali", logoUrl: null, status: "ACTIVE", current: false, roles: ["SUPER_ADMIN", "class_teacher"] };

vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: { user: { user_id: 7 } } }) }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../../lib/schoolSwitch", async (orig) => {
  const m: any = await orig();
  return { ...m, mySchools: () => Promise.resolve([A, B]), mySchoolsInfo: () => Promise.resolve({ schools: [A, B], unlinkedCount: 0 }) };
});

import SchoolSwitcher, { SchoolSwitchHost, roleLabel } from "../SchoolSwitcher";
import { initialsOf } from "../../ui/UserAvatar";

/** A menu that closes (unmounting the switcher) the moment a school is picked, like the account menu. */
const ClosingMenu: React.FC = () => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <SchoolSwitchHost />
      {open && (
        <div role="dialog" aria-label="Account menu">
          <SchoolSwitcher variant="menu" onPicked={() => setOpen(false)} />
        </div>
      )}
    </>
  );
};

describe("school switcher in a menu", () => {
  it("expands in place with readable roles and the current school marked", async () => {
    const user = userEvent.setup();
    render(<ClosingMenu />);
    const toggle = await screen.findByRole("button", { name: /Switch school/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("NGA Cambridge Program"); // current school under the label
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("menu", { name: "Your schools" });
    const items = within(list).getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("NGA Cambridge Program");
    expect(items[0]).toHaveTextContent("Current");
    expect(items[0]).toBeDisabled();
    expect(items[1]).toHaveTextContent("New Generation Coding Academy of Kigali");
    expect(items[1]).toHaveTextContent("Super admin · Class teacher");
    expect(items[1]).not.toHaveTextContent("SUPER_ADMIN");
  });

  it("still asks to confirm after the menu closes on pick", async () => {
    const user = userEvent.setup();
    render(<ClosingMenu />);
    await user.click(await screen.findByRole("button", { name: /Switch school/ }));
    await user.click(screen.getByRole("menuitem", { name: /New Generation Coding Academy/ }));
    expect(screen.queryByRole("dialog", { name: "Account menu" })).toBeNull(); // the menu is gone
    expect((await screen.findAllByText(/New Generation Coding Academy of Kigali/)).length).toBeGreaterThan(0); // the confirm dialog shows the target
  });
});

describe("initials", () => {
  it("come from letters only", () => {
    expect(initialsOf("Niyongabo Emmanuel (Eric)")).toBe("NE");
    expect(initialsOf("Jean-Paul Uwase")).toBe("JU");
    expect(initialsOf("  Ada  ")).toBe("A");
    expect(initialsOf("(x)")).toBe("?");
  });

  it("role labels", () => {
    expect(roleLabel("SUPER_ADMIN")).toBe("Super admin");
    expect(roleLabel("Head of department")).toBe("Head of department");
    expect(roleLabel("ADMIN")).toBe("Admin");
  });
});
