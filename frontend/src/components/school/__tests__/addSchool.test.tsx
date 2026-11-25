import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

/** GAP-A: e-mail matches in other schools are only counted; the person adds one with its password. */

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../services/api", () => ({ default: http, ToastStore: { getShowToast: () => null } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: { user: { user_id: 7 } }, isAuthenticated: true, isLoading: false }) }));

import { forgetMySchools, linkSchool, mySchoolsInfo, SwitchError } from "../../../lib/schoolSwitch";
import SchoolSwitcher, { SchoolSwitchHost } from "../SchoolSwitcher";
import SwitchSchoolPage from "../SwitchSchoolPage";

const A = { tid: 1, slug: "nga", name: "New Generation Academy", logoUrl: null, status: "ACTIVE", current: true, roles: ["TEACHER"] };
const B = { tid: 2, slug: "ghs", name: "Green Hills School", logoUrl: null, status: "ACTIVE", current: false };
const list = (schools: unknown[], unlinkedCount: number) => ({ data: { data: { schools, unlinkedCount } } });

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  toast.mockReset();
  forgetMySchools();
});

describe("GAP-A: add another school", () => {
  it("GAP-A: mySchoolsInfo reads the count; linkSchool posts the password and maps refusals", async () => {
    http.get.mockResolvedValueOnce(list([A], 2));
    expect(await mySchoolsInfo(true)).toEqual({ schools: [A], unlinkedCount: 2 });
    http.post.mockResolvedValueOnce({ data: { data: { school: B } } });
    expect(await linkSchool("pw")).toEqual(B);
    expect(http.post).toHaveBeenCalledWith("/auth/link-school", { password: "pw" });
    http.post.mockRejectedValueOnce({ response: { status: 403, data: { code: "WRONG_PASSWORD", message: "nope" } } });
    await expect(linkSchool("bad")).rejects.toMatchObject({ code: "WRONG_PASSWORD", message: "nope" });
    expect(SwitchError).toBeTruthy();
  });

  it("GAP-A: one listed school + unlinked matches: no chip, but the account menu offers 'Add another school' and linking refreshes the list", async () => {
    const user = userEvent.setup();
    http.get.mockResolvedValueOnce(list([A], 1)).mockResolvedValue(list([A, B], 0));
    http.post.mockResolvedValueOnce({ data: { data: { school: B } } });
    const { container } = render(
      <>
        <SchoolSwitchHost />
        <SchoolSwitcher />
        <SchoolSwitcher variant="menu" />
      </>,
    );
    const item = await screen.findByRole("menuitem", { name: /Add another school/ });
    expect(item).toHaveTextContent("Your e-mail is used in 1 more school. Confirm with that school's password to add it.");
    expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull(); // still no chip with one school
    await user.click(item);
    await user.type(await screen.findByLabelText("Your password at the other school"), "There-pw1");
    await user.click(screen.getByRole("button", { name: /Add school/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Green Hills School was added to your schools", "success"));
    // The list refetches: two schools now, so the chip appears.
    await waitFor(() => expect(screen.getByRole("button", { name: /School: New Generation Academy/ })).toBeInTheDocument());
  });

  it("GAP-A: a wrong password shows the error and a failure toast", async () => {
    const user = userEvent.setup();
    http.get.mockResolvedValue(list([A], 1));
    http.post.mockRejectedValueOnce({ response: { status: 403, data: { code: "WRONG_PASSWORD", message: "That password doesn't open another school account with your e-mail." } } });
    render(
      <>
        <SchoolSwitchHost />
        <SchoolSwitcher variant="menu" />
      </>,
    );
    await user.click(await screen.findByRole("menuitem", { name: /Add another school/ }));
    await user.type(await screen.findByLabelText("Your password at the other school"), "wrong");
    await user.click(screen.getByRole("button", { name: /Add school/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't open another school account");
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("doesn't open"), "error");
  });

  it("GAP-A: nothing extra for a one-school person without matches", async () => {
    http.get.mockResolvedValue(list([A], 0));
    const { container } = render(<SchoolSwitcher variant="menu" />);
    await waitFor(() => expect(http.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("GAP-A: the switch-school page shows a skeleton, then the add entry", async () => {
    let resolve!: (v: unknown) => void;
    http.get.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(
      <MemoryRouter>
        <SwitchSchoolPage />
      </MemoryRouter>,
    );
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    resolve(list([A], 3));
    expect(await screen.findByRole("menuitem", { name: /Add another school/ })).toHaveTextContent("used in 3 more schools");
  });
});
