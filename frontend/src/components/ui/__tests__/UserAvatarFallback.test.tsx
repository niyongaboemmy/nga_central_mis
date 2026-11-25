import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../lib/avatarDirectory", () => ({ useUserAvatar: () => null }));

import UserAvatar, { shadeFor } from "../UserAvatar";

describe("UserAvatar without a photo", () => {
  it("shows initials on a flat blue shade by default (lists)", () => {
    render(<UserAvatar name="Jane Doe" />);
    const el = screen.getByRole("img", { name: "Jane Doe" });
    expect(el).toHaveTextContent("JD");
    expect(el.className).toMatch(/\bbg-blue-[5-9]00\b/);
    expect(el.className).not.toMatch(/gradient|indigo|violet|purple|pink|rose|amber|emerald|sky|cyan|fuchsia/);
  });

  it("shows a person icon instead of initials for one person's own view", () => {
    render(<UserAvatar name="Jane Doe" fallback="person" />);
    const el = screen.getByRole("img", { name: "Jane Doe" });
    expect(el).toHaveAttribute("data-fallback", "person");
    expect(el).not.toHaveTextContent("JD");
    expect(el.querySelector("svg")).not.toBeNull();
  });

  it("gives the same person the same blue every time, and only blues", () => {
    expect(shadeFor("Jane Doe")).toBe(shadeFor("Jane Doe"));
    for (const n of ["A", "Bo", "Cyd", "Dee Ann", "Eric M", "Uwase Aline", "Mugisha"]) expect(shadeFor(n)).toMatch(/^bg-blue-[5-9]00$/);
  });
});
