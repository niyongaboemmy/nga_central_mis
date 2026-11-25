/**
 * Surface + accent tokens (TENANT_MANAGEMENT_UI_CONSISTENCY_PLAN.md §3, §4 Phase 1).
 *
 * The MIS look in one place, so new screens stop re-deriving it:
 * - one hairline border per section; anything inside a section is a tinted inset, never a
 *   second outlined box (no shadows in NGA UIs, so borders carry depth -- softly);
 * - dark surfaces are translucent over the black canvas, dark borders always carry alpha;
 * - one blue (`blue-*`, the colour of the sidebar, ui/Button and every tab underline);
 * - gray neutrals in both themes.
 */

export const surface = {
  /** a section: the only element that gets a border */
  card: "rounded-2xl border border-gray-200 bg-white dark:border-gray-700/40 dark:bg-gray-800/40",
  /** something inside a section: tint, no border */
  inset: "rounded-xl bg-gray-50 dark:bg-gray-800/50",
  /** an inset row that reacts to hover (list rows, pickable people) */
  insetHover: "rounded-xl transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50",
  /** text inputs, textareas, selects */
  input:
    "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700/30 dark:bg-gray-900/50 dark:text-white dark:placeholder-gray-500",
  /** divider lines and the colour for divide-y */
  divider: "border-gray-100 dark:border-gray-700/30",
  divide: "divide-gray-100 dark:divide-gray-700/30",
  /** tab underline rail, timeline rail */
  rail: "border-gray-200 dark:border-gray-700/30",
  /** loading block */
  skeleton: "animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800/70",
  /** a sticky bar over content (decision bar): opaque enough to read over the page */
  sticky: "border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700/40 dark:bg-black/80",
} as const;

export const accent = {
  solid: "bg-blue-600 text-white hover:bg-blue-700",
  text: "text-blue-600 dark:text-blue-400",
  soft: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  /** chosen option: ring, no extra border */
  selected: "ring-2 ring-blue-600 bg-blue-50 dark:ring-blue-500 dark:bg-blue-500/15",
  focus: "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
} as const;

/** Section heading used across console pages. */
export const sectionTitle = "text-base font-semibold text-gray-900 dark:text-white";
