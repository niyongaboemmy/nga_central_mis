import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

const updateUserTheme = vi.fn(() => Promise.resolve());
vi.mock("../../api/users", () => ({ updateUserTheme: (...a: unknown[]) => updateUserTheme(...(a as [])) }));
vi.mock("../UserContext", () => ({ useUser: () => ({ user: null, isAuthenticated: true }) }));

import { ThemeProvider, useTheme } from "../ThemeContext";

const Probe = () => <span data-testid="t">{useTheme().theme}</span>;

describe("ThemeContext ← NGA desktop app", () => {
  it("applies a theme pushed by the desktop app, and saves it only when asked", () => {
    localStorage.setItem("theme", "light");
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>);
    const push = (theme: string, persist: boolean) => {
      const ev = new CustomEvent("nga:set-theme", { detail: { theme, persist }, cancelable: true });
      let handled = false;
      act(() => { handled = !window.dispatchEvent(ev); });
      return handled;
    };
    expect(push("dark", false)).toBe(true); // handled by the app itself
    expect(getByTestId("t").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(updateUserTheme).not.toHaveBeenCalled();
    push("light", true);
    expect(getByTestId("t").textContent).toBe("light");
    expect(updateUserTheme).toHaveBeenCalledWith("light");
    expect(push("purple", true)).toBe(false); // ignored
  });
});
