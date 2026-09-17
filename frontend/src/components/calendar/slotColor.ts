import type { CalendarSlot } from "../../api/calendar";

/**
 * Subject / activity colour handling for the calendar grid.
 *
 * A slot's colour is the subject's own colour (`Subject.color`) — exactly the
 * swatch shown against that subject in admin → Academics → Subjects. Every
 * calendar surface (admin grid, teacher schedule, dashboard widget, tooltip)
 * reads it the same way, so a subject looks identical everywhere.
 *
 * The only fallback is for a slot with no colour at all (a null join, legacy
 * data): a stable palette colour derived from the subject id, so it is at
 * least distinct and consistent rather than blank.
 */

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A hand-picked palette: distinct hues, similar saturation/lightness so no
 *  one slot shouts louder than the rest. */
export const SUBJECT_PALETTE = [
  "#2563EB", // blue
  "#7C3AED", // violet
  "#DB2777", // pink
  "#DC2626", // red
  "#EA580C", // orange
  "#CA8A04", // amber
  "#16A34A", // green
  "#0D9488", // teal
  "#0891B2", // cyan
  "#4F46E5", // indigo
  "#9333EA", // purple
  "#E11D48", // rose
  "#65A30D", // lime
  "#0284C7", // sky
  "#B45309", // bronze
  "#475569", // slate
];

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

/** The colour a slot should actually render in. */
export const getSlotColor = (slot: {
  color?: string | null;
  subject_id?: number | null;
  subject_name?: string | null;
}): string => {
  const raw = slot.color?.trim();
  if (raw && HEX_RE.test(raw)) return raw;
  // No usable stored colour — derive a stable one so the slot is still legible.
  const seed =
    slot.subject_id != null
      ? `id:${slot.subject_id}`
      : slot.subject_name || "unknown";
  return SUBJECT_PALETTE[hashString(seed) % SUBJECT_PALETTE.length];
};

const normaliseHex = (hex: string): string => {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return h.length === 6 ? h : "3b82f6";
};

/** Parse `#hex`, `#rgb`, or `rgb(r, g, b)` / `rgba(...)` into an [r,g,b] triple. */
export const hexToRgb = (hex: string): [number, number, number] => {
  const rgbMatch = hex.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgbMatch) {
    return [
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3]),
    ];
  }
  const h = normaliseHex(hex);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

export const hexToRgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Relative luminance (WCAG) — used to decide black vs white text. */
export const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Readable text colour for a solid `hex` background. */
export const readableTextColor = (hex: string): string =>
  luminance(hex) > 0.55 ? "#1f2937" : "#ffffff";

/** A darker shade of `hex` for accents / borders. */
export const shadeColor = (hex: string, amount = 0.78): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * amount)}, ${Math.round(g * amount)}, ${Math.round(
    b * amount,
  )})`;
};

/** `hex` mixed toward white by `amount` (0 = unchanged, 1 = white). */
export const tintColor = (hex: string, amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};

/** `hex` mixed toward black by `amount`. */
export const darkenColor = (hex: string, amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};

/** Blend `hex` toward the opaque colour `toward` (also hex). `amount` 0..1 is
 *  how much of `toward` to mix in. Produces an opaque colour, so the result
 *  does not depend on whatever sits behind it. */
export const blendColor = (
  hex: string,
  toward: string,
  amount: number,
): string => {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(toward);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
};

export interface SlotSurface {
  background: string;
  hoverBackground: string;
  text: string;
  meta: string;
  accent: string;
}

// The surface each slot blends toward, per theme. Opaque blends (not alpha
// washes) so a slot reads the same regardless of the cell / page behind it —
// an alpha wash over a near-black page flattened every hue into the same murk.
const DARK_SURFACE = "#0b1220";
const LIGHT_SURFACE = "#ffffff";

/**
 * The flat "coloured event card" treatment for a slot.
 *
 * The subject colour carries the card — only lightly blended toward the page
 * surface so a blue subject reads unmistakably blue next to a green one — with
 * no gradient, shadow, or accent bar. Text colour is chosen for contrast
 * against the resulting fill so every subject colour stays legible.
 */
export const slotSurface = (color: string, isDark: boolean): SlotSurface => {
  const background = isDark
    ? blendColor(color, DARK_SURFACE, 0.28)
    : blendColor(color, LIGHT_SURFACE, 0.12);
  const hoverBackground = isDark
    ? blendColor(color, DARK_SURFACE, 0.14)
    : blendColor(color, LIGHT_SURFACE, 0);
  const text = readableTextColor(background);
  return {
    background,
    hoverBackground,
    text,
    meta: hexToRgba(text, 0.78),
    accent: color,
  };
};

export type ColoredSlot = CalendarSlot;
