import { RefObject, useEffect, useState } from "react";

interface VirtualWindow {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

/**
 * Minimal fixed-height row windowing for the enrollment matrix. A dedicated
 * virtualisation library would be a heavy dependency for one grid, and the
 * matrix's rows are a uniform height by construction.
 *
 * Below `threshold` rows it returns the full range, so small classes render
 * plainly and stay fully searchable by assistive tech and by tests.
 */
export const useVirtualRows = (
  scrollRef: RefObject<HTMLElement>,
  rowCount: number,
  rowHeight: number,
  threshold = 60,
  overscan = 8,
): VirtualWindow => {
  const [range, setRange] = useState<VirtualWindow>({
    start: 0,
    end: rowCount,
    padTop: 0,
    padBottom: 0,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (rowCount <= threshold || !el) {
      setRange({ start: 0, end: rowCount, padTop: 0, padBottom: 0 });
      return;
    }

    const recompute = () => {
      const viewport = el.clientHeight || 400;
      const first = Math.max(
        0,
        Math.floor(el.scrollTop / rowHeight) - overscan,
      );
      const visible = Math.ceil(viewport / rowHeight) + overscan * 2;
      const last = Math.min(rowCount, first + visible);
      setRange({
        start: first,
        end: last,
        padTop: first * rowHeight,
        padBottom: (rowCount - last) * rowHeight,
      });
    };

    recompute();
    el.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      el.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [scrollRef, rowCount, rowHeight, threshold, overscan]);

  return range;
};
