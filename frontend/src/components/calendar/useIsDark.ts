import { useEffect, useState } from "react";

/**
 * Whether the app is in dark mode, tracked without the ThemeContext so the
 * calendar components can be rendered (and unit-tested) in isolation.
 *
 * ThemeProvider toggles `dark` / `light` on `<html>`, so that class is the
 * source of truth here.
 */
export const useIsDark = (): boolean => {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
};
