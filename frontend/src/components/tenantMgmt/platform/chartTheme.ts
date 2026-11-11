import { useTheme } from "../../../contexts/ThemeContext";

/** recharts colours for the console, light and dark (AA against the card surface). */
export const useChartTheme = () => {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    grid: dark ? "#334155" : "#e2e8f0",
    tick: dark ? "#cbd5e1" : "#475569",
    surface: dark ? "#0f172a" : "#ffffff",
    tooltip: { background: dark ? "#0f172a" : "#ffffff", border: `1px solid ${dark ? "#334155" : "#e2e8f0"}`, borderRadius: 12, fontSize: 12, color: dark ? "#e2e8f0" : "#0f172a" },
    series: [dark ? "#7dd3fc" : "#0284c7", dark ? "#6ee7b7" : "#059669", dark ? "#c4b5fd" : "#7c3aed", dark ? "#fcd34d" : "#d97706"],
  };
};
