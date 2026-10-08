import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UserAvatar, { initialsOf } from "../UserAvatar";

const AVATAR = {
  version: 1790000000,
  sm: "https://api.example/avatars/7/1790000000/sm.webp?s=x",
  md: "https://api.example/avatars/7/1790000000/md.webp?s=x",
  lg: "https://api.example/avatars/7/1790000000/lg.webp?s=x",
};

describe("UserAvatar", () => {
  it("derives initials from first and last name", () => {
    expect(initialsOf("Jane Doe")).toBe("JD");
    expect(initialsOf("  Jean   Paul  Uwase ")).toBe("JU");
    expect(initialsOf("madonna")).toBe("M");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf(null)).toBe("?");
  });

  it("shows initials when there is no picture", () => {
    render(<UserAvatar name="Jane Doe" />);
    const el = screen.getByRole("img", { name: "Jane Doe" });
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe("JD");
  });

  it("uses the small rendition for small sizes and offers every size to the browser", () => {
    render(<UserAvatar name="Jane Doe" avatar={AVATAR} size={32} />);
    const img = screen.getByRole("img", { name: "Jane Doe" }) as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(AVATAR.sm);
    expect(img.getAttribute("srcset")).toBe(`${AVATAR.sm} 64w, ${AVATAR.md} 256w, ${AVATAR.lg} 512w`);
    expect(img.getAttribute("sizes")).toBe("32px");
  });

  it("picks the medium and large renditions for bigger avatars", () => {
    const { rerender } = render(<UserAvatar name="Jane Doe" avatar={AVATAR} size={128} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe(AVATAR.md);
    rerender(<UserAvatar name="Jane Doe" avatar={AVATAR} size={400} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe(AVATAR.lg);
  });

  it("accepts a single URL (the spoke-style avatar_url)", () => {
    render(<UserAvatar name="Jane Doe" src={AVATAR.md} size={40} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe(AVATAR.md);
    expect(img.getAttribute("srcset")).toBeNull();
  });

  it("falls back to initials when the picture fails to load, and retries a new URL", () => {
    const { rerender } = render(<UserAvatar name="Jane Doe" src="https://broken.example/a.webp" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img").textContent).toBe("JD");
    rerender(<UserAvatar name="Jane Doe" src={AVATAR.md} />);
    expect(screen.getByRole("img").tagName).toBe("IMG");
  });
});
