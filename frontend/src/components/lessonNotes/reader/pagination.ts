/** A4 at 96dpi. Kept in px rather than mm so page-turn maths and the on-screen sheet agree
 *  exactly; the print stylesheet re-declares real A4 via @page for the paper output. */
export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

/** Horizontal padding on a sheet — also the width the column flow loses to margins. */
export const SHEET_PADDING_X = 64;

/** Gutter between paginated columns. Never visible: it's what a page turn scrolls past. */
export const PAGE_GAP = 80;

/** Width of one page's text area, i.e. one column in the paginated flow. */
export const COLUMN_WIDTH = A4_WIDTH - 2 * SHEET_PADDING_X;

/** Distance the flow travels for one page turn. */
export const PAGE_STRIDE = COLUMN_WIDTH + PAGE_GAP;

/** How many pages a paginated flow currently occupies. */
export const countPages = (flow: HTMLElement | null): number => {
  if (!flow) return 1;
  const stride = flow.clientWidth + PAGE_GAP;
  if (stride <= PAGE_GAP) return 1;
  return Math.max(1, Math.round((flow.scrollWidth + PAGE_GAP) / stride));
};

/** Which page an element sits on. In a multi-column flow, horizontal offset *is* the page. */
export const pageOfElement = (el: HTMLElement, flow: HTMLElement | null): number => {
  if (!flow) return 0;
  const stride = flow.clientWidth + PAGE_GAP;
  if (stride <= PAGE_GAP) return 0;
  return Math.max(0, Math.round((el.offsetLeft - flow.offsetLeft) / stride));
};

/** The sheet is a fixed 794x1123px so pagination maths stays exact; on anything narrower
 *  (tablets, phones, or a desktop with the AI panel open) it scales down to fit rather than
 *  overflowing horizontally. */
export const sheetScale = (availableWidth: number): number =>
  Math.min(1, Math.max(0.32, availableWidth / A4_WIDTH));

export const bookFlowStyle = (page: number): React.CSSProperties => ({
  columnWidth: `${COLUMN_WIDTH}px`,
  columnGap: `${PAGE_GAP}px`,
  height: "100%",
  transform: `translateX(-${page * PAGE_STRIDE}px)`,
  transition: "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
});
