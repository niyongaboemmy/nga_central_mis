import type { CalendarSlot } from "../../api/calendar";

/**
 * Subject / activity colour handling for the calendar grid.
 *
 * A slot's colour comes from its subject (`Subject.color`), but many subjects
 * are left on the seed default (`#3B82F6`), which makes a whole week render in
 * one flat blue. So: an explicitly-chosen colour is always honoured, and any
 * slot still on the default (or with no colour at all) falls back to a stable,
 * evenly-spread palette colour derived from the subject — same subject, same
 * colour, every week, with no data entry required.
 */

const DEFAULT_SUBJECT_COLOR = "#3b82f6";

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

const isDefaultOrEmpty = (color?: string | null): boolean =>
  !color || color.trim().toLowerCase() === DEFAULT_SUBJECT_COLOR;

/** The colour a slot should actually render in. */
export const getSlotColor = (slot: {
  color?: string | null;
  subject_id?: number | null;
  subject_name?: string | null;
}): string => {
  if (!isDefaultOrEmpty(slot.color)) return slot.color as string;
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

export const hexToRgb = (hex: string): [number, number, number] => {
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

export type ColoredSlot = CalendarSlot;
