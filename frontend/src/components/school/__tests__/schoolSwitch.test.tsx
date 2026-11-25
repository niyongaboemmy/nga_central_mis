import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** School switching in MIS (TENANT_SWITCHING_PLAN.md §4.2–4.4, Appendix A). */

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../services/api", () => ({ default: http, ToastStore: { getShowToast: () => null } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));

import { readSchoolCookie, rememberSchool, rememberedSchool, safeReturnUrl, switchSchool, SwitchError, watchSchoolChanges, forgetMySchools } from "../../../lib/schoolSwitch";
import SwitchSchoolDialog from "../SwitchSchoolDialog";
import SchoolPicker from "../../auth/SchoolPicker";

const A = { tid: 1, slug: "nga", name: "New Generation Academy", logoUrl: null, status: "ACTIVE", current: true, roles: ["TEACHER"] };
const B = { tid: 2, slug: "ghs", name: "Green Hills School", logoUrl: null, status: "ACTIVE", current: false };

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  toast.mockReset();
  forgetMySchools();
  localStorage.clear();
});

describe("the nga_school cookie and return URLs", () => {
  it("parses only well-formed values", () => {
    expect(readSchoolCookie("a=1; nga_school=2.abcDEF123_-; b=2")).toEqual({ tid: 2, sid: "abcDEF123_-" });
    expect(readSchoolCookie("nga_school=2")).toBeNull();
    expect(readSchoolCookie("nga_school=x.abcdefghij")).toBeNull();
    expect(readSchoolCookie("")).toBeNull();
  });

  it("allows same-origin and *.amashuri.com https returns only", () => {
    const here = { origin: "https://mis.amashuri.com", hostname: "mis.amashuri.com" } as Location;
    expect(safeReturnUrl("https://taskmentor.amashuri.com/login?sso=1", here)).toBe("https://taskmentor.amashuri.com/login?sso=1");
    expect(safeReturnUrl("/home", here)).toBe("https://mis.amashuri.com/home");
    expect(safeReturnUrl("https://evil.example/amashuri.com", here)).toBeNull();
    expect(safeReturnUrl("http://tupo.amashuri.com/", here)).toBeNull();
    expect(safeReturnUrl("https://amashuri.com.evil.io/", here)).toBeNull();
    expect(safeReturnUrl("javascript:alert(1)", here)).toBeNull();
  });

  it("remembers a sign-in school per identifier, case-insensitively", () => {
    rememberSchool("Jane@Mail.test", "ghs");
    expect(rememberedSchool("jane@mail.test")).toBe("ghs");
    rememberSchool("jane@mail.test", null);
    expect(rememberedSchool("jane@mail.test")).toBeNull();
  });
});

describe("switchSchool()", () => {
  it("stores the new token and tells other tabs", async () => {
    const post = vi.fn();
    (globalThis as any).BroadcastChannel = class {
      postMessage = post;
      close() {}
    };
    http.post.mockResolvedValue({ data: { data: { token: "new.jwt.token", tenant: { tid: 2, name: "Green Hills School" } } } });
    await expect(switchSchool("ghs")).resolves.toEqual({ tid: 2, name: "Green Hills School" });
    expect(http.post).toHaveBeenCalledWith("/auth/switch-school", { tenant: "ghs" });
    expect(localStorage.getItem("token")).toBe("new.jwt.token");
    expect(post).toHaveBeenCalledWith({ type: "school-changed", tid: 2 });
  });

  it("turns server refusals into coded errors", async () => {
    http.post.mockRejectedValue({ response: { data: { code: "PASSWORD_REQUIRED", message: "Enter your password" } } });
    await expect(switchSchool("ghs")).rejects.toMatchObject({ code: "PASSWORD_REQUIRED" });
    await expect(switchSchool("ghs")).rejects.toBeInstanceOf(SwitchError);
  });
});

describe("watchSchoolChanges()", () => {
  it("fires once when the cookie names another school on focus", () => {
    const onChange = vi.fn();
    Object.defineProperty(document, "cookie", { configurable: true, get: () => "nga_school=2.abcdefghij" });
    const stop = watchSchoolChanges(() => 1, onChange);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignores the same school and a missing cookie", () => {
    const onChange = vi.fn();
    Object.defineProperty(document, "cookie", { configurable: true, get: () => "nga_school=1.abcdefghij" });
    const stop = watchSchoolChanges(() => 1, onChange);
    window.dispatchEvent(new Event("focus"));
    Object.defineProperty(document, "cookie", { configurable: true, get: () => "" });
    window.dispatchEvent(new Event("focus"));
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });
});

describe("SwitchSchoolDialog", () => {
  it("asks for the other school's password only when the server wants it, then switches", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    http.post
      .mockRejectedValueOnce({ response: { data: { code: "PASSWORD_REQUIRED", message: "Enter your password for Green Hills School." } } })
      .mockResolvedValueOnce({ data: { data: { token: "t.t.t", tenant: { tid: 2, name: "Green Hills School" } } } });
    const user = userEvent.setup();
    render(<SwitchSchoolDialog from={A} to={B} next="/home" onClose={vi.fn()} />);
    expect(screen.queryByLabelText(/Your password for/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Switch to Green Hills School/ }));
    const pw = await screen.findByLabelText("Your password for Green Hills School");
    await user.type(pw, "Other-pw1");
    await user.click(screen.getByRole("button", { name: /Switch to Green Hills School/ }));
    await waitFor(() => expect(http.post).toHaveBeenLastCalledWith("/auth/switch-school", { tenant: "ghs", password: "Other-pw1" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/home"));
    expect(toast).toHaveBeenCalledWith("Switched to Green Hills School", "success");
  });

  it("shows a wrong password and stays open", async () => {
    http.post.mockRejectedValue({ response: { data: { code: "WRONG_PASSWORD", message: "That isn't your password for Green Hills School." } } });
    const user = userEvent.setup();
    render(<SwitchSchoolDialog from={A} to={B} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Switch to Green Hills School/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That isn't your password");
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("isn't your password"), "error");
  });
});

describe("SchoolPicker (sign-in)", () => {
  it("passes the remember choice with the school", async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(<SchoolPicker schools={[{ tid: 1, name: "NGA", slug: "nga" }, { tid: 2, name: "Green Hills", slug: "ghs", logoUrl: null }]} onChoose={onChoose} onClose={vi.fn()} />);
    await user.click(screen.getByLabelText("Remember on this device"));
    await user.click(screen.getByRole("button", { name: "Sign in to Green Hills" }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ slug: "ghs" }), true);
  });
});
