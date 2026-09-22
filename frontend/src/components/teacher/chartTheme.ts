import { useIsDark } from "../calendar/useIsDark";

// ─── Chart parameters for the teacher dashboard ─────────────────────────────
//
// The charts on this page are *analytical status* charts, not identity charts:
// every mark answers "is this on track", never "which series is this". So the
// only palettes needed are
//
//   • a reserved status set — critical / warning / good — for the coverage
//     bullets, and
//   • one sequential blue, light→dark, used as emphasis (today vs the rest of
//     the week; one hue, never a rainbow) for the load columns.
//
// The status trio was validated against both surfaces this app actually
// renders on (light card #ffffff, dark card ≈ #0f141a):
//
//   CVD separation      worst adjacent ΔE 11.3  (target ≥ 8)   PASS both modes
//   Normal-vision floor worst adjacent ΔE 27.6  (floor ≥ 15)   PASS both modes
//   Contrast            warning is 1.83:1 on the light surface — the documented
//                       status-palette exception, which obliges *visible
//                       labels*, not color alone. Every bar therefore carries
//                       its own "n/m weeks" label and a status word, and every
//                       chart ships a table view.
//
// A four-step ladder (adding an "awaiting" orange) was tried first and cut:
// orange against yellow measured ΔE 13.6 normal-vision, under the hard floor.
// Three steps is the honest ceiling here.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS = {
  critical: "#d03b3b",
  warning: "#fab219",
  good: "#0ca30c",
} as const;

export type StatusKey = keyof typeof STATUS;

export interface ChartTheme {
  /** Emphasised mark (today / the subject in focus). */
  accent: string;
  /** Same hue, stepped back — the rest of the series. */
  muted: string;
  /** Empty part of a bullet track. */
  track: string;
  /** Solid hairline gridlines; never dashed. */
  grid: string;
  /** Axis tick + label ink. Text never wears a series color. */
  ink: string;
  surface: string;
  tooltipBg: string;
  tooltipBorder: string;
  /**
   * Recharts gives its tooltip no text colour of its own, so the label
   * inherits and turns near-black on a near-black panel in dark mode. Every
   * tooltip sets this explicitly.
   */
  tooltipInk: string;
}

const LIGHT: ChartTheme = {
  accent: "#2a78d6", // blue 450
  muted: "#9ec5f4", // blue 200
  track: "#e2e8f0", // border-light
  grid: "#e2e8f0",
  ink: "#64748b", // text-secondary-light — 4.8:1 on the light card
  surface: "#ffffff",
  tooltipBg: "#ffffff",
  tooltipBorder: "rgba(11,11,11,0.10)",
  tooltipInk: "#1e293b", // text-primary-light
};

const DARK: ChartTheme = {
  accent: "#3987e5", // blue 400, stepped for the dark surface
  muted: "#184f95", // blue 600
  track: "#334155",
  grid: "#334155",
  ink: "#94a3b8", // text-secondary-dark — 7.9:1 on the dark card
  surface: "#0f141a",
  tooltipBg: "#1e293b",
  tooltipBorder: "rgba(255,255,255,0.10)",
  tooltipInk: "#f1f5f9", // text-primary-dark
};

export const useChartTheme = (): ChartTheme => (useIsDark() ? DARK : LIGHT);
