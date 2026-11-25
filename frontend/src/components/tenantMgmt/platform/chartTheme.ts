import { useTheme } from "../../../contexts/ThemeContext";

/** recharts colours for the console, light and dark (AA against the card surface). */
export const useChartTheme = () => {
  const { theme } = useTheme();
  const dark = theme === "dark";
  // Gray neutrals like the rest of the MIS (slate read navy next to other pages).
  return {
    grid: dark ? "#1f2937" : "#e5e7eb",
    tick: dark ? "#9ca3af" : "#4b5563",
    surface: dark ? "#111827" : "#ffffff",
    tooltip: { background: dark ? "#111827" : "#ffffff", border: `1px solid ${dark ? "rgba(55,65,81,0.4)" : "#e5e7eb"}`, borderRadius: 12, fontSize: 12, color: dark ? "#f3f4f6" : "#111827" },
    // Blue first (platform palette: blue only, green/amber for status), AA on the card surface.
    series: [dark ? "#60a5fa" : "#2563eb", dark ? "#6ee7b7" : "#059669", dark ? "#bfdbfe" : "#1e40af", dark ? "#fcd34d" : "#d97706"],
  };
};
