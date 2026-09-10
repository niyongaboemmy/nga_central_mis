/**
 * Subject colour assignment.
 *
 * Every subject carries a `color` that the academic calendar paints its slots
 * with. New subjects default to `#3B82F6`, so a school that never opens the
 * colour picker ends up with a calendar that is one flat blue. This module
 * hands each subject a distinct, evenly-spread colour deterministically:
 *
 *  - Subjects are ranked by `subject_id` (stable — a subject keeps its colour
 *    as the catalogue grows).
 *  - Colour N is hue `N * 137.508°` (the golden angle) at a fixed saturation
 *    and lightness, so any number of subjects stay maximally far apart on the
 *    colour wheel without ever repeating.
 *  - A subject that already has a hand-picked colour keeps it (unless `force`),
 *    and generated colours step past any hue that lands too close to one of
 *    those, so the auto and manual colours never clash.
 */

export const DEFAULT_SUBJECT_COLOR = "#3B82F6";

const GOLDEN_ANGLE = 137.508;
const SATURATION = 0.62;
const LIGHTNESS = 0.52;
/**
 * A generated hue this close (degrees) to a hand-picked one is nudged past it.
 * Only used against reserved *manual* colours — generated colours spread
 * themselves via the golden angle and a lightness cycle, so more subjects than
 * fit in 360°/MIN_HUE_SEPARATION is fine.
 */
const MIN_HUE_SEPARATION = 16;
/** Lightness offsets cycled through so near-equal hues still differ. */
const LIGHTNESS_CYCLE = [0, -0.09, 0.09, -0.045, 0.045];

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** HSL (h in degrees, s & l in 0..1) → "#rrggbb". */
export const hslToHex = (h: number, s: number, l: number): string => {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = (
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  ).map((v) => Math.round((v + m) * 255));
  return (
    "#" +
    [r, g, b]
      .map((v) => clamp(v, 0, 255).toString(16).padStart(2, "0"))
      .join("")
  );
};

/** "#rgb" / "#rrggbb" → hue in degrees, or null when unparseable. */
export const hexToHue = (hex?: string | null): number | null => {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return (hue + 360) % 360;
};

const isDefaultColor = (color?: string | null): boolean =>
  !color || color.trim().toLowerCase() === DEFAULT_SUBJECT_COLOR.toLowerCase();

const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export interface SubjectColorInput {
  subject_id: number;
  color?: string | null;
}

export interface SubjectColorAssignment {
  subject_id: number;
  /** The colour it had before (for reporting / undo). */
  previous_color: string | null;
  color: string;
}

export interface AssignOptions {
  /** Reassign every subject, discarding hand-picked colours too. */
  force?: boolean;
}

/**
 * Pure assignment: given the subjects, return the `color` each should have.
 *
 * Only subjects that actually change are returned, so the caller can write a
 * minimal update. Deterministic — same input, same output, and stable as new
 * subjects are appended.
 */
export const assignUniqueSubjectColors = (
  subjects: SubjectColorInput[],
  opts: AssignOptions = {},
): SubjectColorAssignment[] => {
  const ranked = [...subjects].sort((a, b) => a.subject_id - b.subject_id);

  // Hues that are already spoken for by hand-picked colours we're keeping.
  const reservedHues: number[] = [];
  if (!opts.force) {
    for (const s of ranked) {
      if (!isDefaultColor(s.color)) {
        const hue = hexToHue(s.color);
        if (hue !== null) reservedHues.push(hue);
      }
    }
  }

  const assignments: SubjectColorAssignment[] = [];
  const usedColors = new Set(
    opts.force
      ? []
      : ranked
          .filter((s) => !isDefaultColor(s.color))
          .map((s) => s.color!.toLowerCase()),
  );
  let step = 0; // golden-angle position, advanced only for generated colours
  let generated = 0; // count of colours actually generated (drives the L cycle)

  for (const s of ranked) {
    if (!opts.force && !isDefaultColor(s.color)) continue;

    // Next golden-angle hue that clears every hand-picked hue.
    let hue = 0;
    for (let guard = 0; guard < 32; guard++) {
      step += 1;
      hue = (step * GOLDEN_ANGLE) % 360;
      if (
        !reservedHues.some((r) => hueDistance(r, hue) < MIN_HUE_SEPARATION)
      ) {
        break;
      }
    }

    // Cycle lightness so that if the sweep ever brings two hues close together
    // (many subjects), their colours still differ; keep bumping until unique.
    let color = "";
    for (let k = 0; k < LIGHTNESS_CYCLE.length + 4; k++) {
      const l =
        LIGHTNESS +
        LIGHTNESS_CYCLE[(generated + k) % LIGHTNESS_CYCLE.length];
      color = hslToHex(hue, SATURATION, l);
      if (!usedColors.has(color.toLowerCase())) break;
    }
    usedColors.add(color.toLowerCase());
    generated += 1;

    const previous = s.color ?? null;
    if (previous?.toLowerCase() !== color.toLowerCase()) {
      assignments.push({
        subject_id: s.subject_id,
        previous_color: previous,
        color,
      });
    }
  }

  return assignments;
};

/**
 * The colour a brand-new subject should get when the creator doesn't choose
 * one: the next hue on the sweep past every colour already in use, so a
 * freshly-added subject is distinct from day one instead of defaulting to blue.
 */
export const nextSubjectColor = (
  existingColors: (string | null | undefined)[],
): string => {
  const takenHues = existingColors
    .map((c) => hexToHue(c))
    .filter((h): h is number => h !== null);

  let hue = 0;
  for (let step = 1; step <= 720; step++) {
    hue = (step * GOLDEN_ANGLE) % 360;
    if (!takenHues.some((t) => hueDistance(t, hue) < MIN_HUE_SEPARATION)) break;
  }
  return hslToHex(hue, SATURATION, LIGHTNESS);
};
