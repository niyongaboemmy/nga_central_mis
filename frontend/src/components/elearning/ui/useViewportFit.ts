import { useLayoutEffect, useState } from "react";

/** The element that scrolls `el` (an overflow ancestor), or the document. */
const scrollParentOf = (el: HTMLElement): HTMLElement => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
};

/**
 * Height that makes `el` fill the screen below the app bar exactly, so the page itself
 * never scrolls — only the panels inside it do. Measured, not guessed: a
 * `calc(100dvh - 4rem)` ignored the app shell's padding, so the whole page scrolled a
 * little and the header slid away. Re-measures on resize and when the layout around it
 * changes (a banner appearing above, the sidebar collapsing).
 */
export function useViewportFit(el: HTMLElement | null, { gap = 12, min = 420 }: { gap?: number; min?: number } = {}): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = el.getBoundingClientRect().top + (document.scrollingElement?.scrollTop ?? 0);
      let h = Math.max(min, Math.floor(window.innerHeight - Math.max(0, top) - gap));
      // Try the height, see what still overflows (the shell's bottom padding, a footer) and
      // take that off too. Restore the inline height React set — clearing it would leave the
      // frame with no height until the next render.
      const prev = el.style.height;
      el.style.height = `${h}px`;
      const scroller = scrollParentOf(el);
      const overflow = scroller.scrollHeight - scroller.clientHeight;
      if (overflow > 0 && overflow < h - min) h -= overflow;
      el.style.height = prev;
      setHeight(h);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (el.parentElement) ro?.observe(el.parentElement);
    return () => {
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [el, gap, min]);
  return height;
}
