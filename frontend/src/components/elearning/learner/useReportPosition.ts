import { useEffect, useRef } from "react";
import { apiService } from "../../../services/api";

// ─── Reporting where the student is on the page ─────────────────────────────
//
// The 30 s heartbeat is the right cadence for accounting reading time and far
// too coarse for a teacher watching somebody read — by the time it fires they
// have scrolled through two sections. This reports the scroll position on its
// own, to an endpoint that writes no database row, so it can afford to be
// frequent.
//
// It is still deliberately quiet: a ping only leaves when the student has
// actually moved somewhere worth reporting, and never more than once every
// MIN_INTERVAL_MS. A class of thirty reading at once therefore costs a handful
// of tiny in-memory writes a second, not a write per student per frame.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_INTERVAL_MS = 4000;
/** Below this, the student is fidgeting rather than reading on. */
const MIN_DELTA_PCT = 2;

/** The heading a reader is under, which is what a teacher can actually act on. */
const headingAbove = (viewportTop: number): string | null => {
  const reader = document.querySelector(".el-reader");
  if (!reader) return null;
  const headings = reader.querySelectorAll("h1, h2, h3");
  let current: string | null = null;
  for (const node of Array.from(headings)) {
    const top = node.getBoundingClientRect().top;
    // Anything whose top has passed just under the viewport's top edge is the
    // section being read; the last such heading wins.
    if (top - viewportTop <= 80) current = node.textContent?.trim() || current;
    else break;
  }
  return current ? current.slice(0, 160) : null;
};

const readScroll = (
  container: HTMLElement | null,
): { pct: number; viewportTop: number } => {
  if (container) {
    const max = container.scrollHeight - container.clientHeight;
    return {
      pct: max > 0 ? (container.scrollTop / max) * 100 : 0,
      viewportTop: container.getBoundingClientRect().top,
    };
  }
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return { pct: max > 0 ? (window.scrollY / max) * 100 : 0, viewportTop: 0 };
};

/**
 * Report this student's reading position for `itemId` while it is open.
 *
 * `containerRef` is the scrolling element in focus mode, where the window does
 * not scroll at all; omit it and the window is tracked.
 */
export const useReportPosition = (
  courseId: number | null,
  itemId: number | null,
  containerRef?: React.RefObject<HTMLElement | null>,
  enabled = true,
) => {
  const lastSent = useRef({ at: 0, pct: -1, heading: null as string | null });

  useEffect(() => {
    if (!enabled || !courseId || !itemId) return;
    lastSent.current = { at: 0, pct: -1, heading: null };

    let frame = 0;
    const report = () => {
      frame = 0;
      if (document.visibilityState !== "visible") return;

      const { pct, viewportTop } = readScroll(containerRef?.current ?? null);
      const rounded = Math.max(0, Math.min(100, Math.round(pct)));
      const heading = headingAbove(viewportTop);
      const now = Date.now();
      const last = lastSent.current;

      const movedEnough = Math.abs(rounded - last.pct) >= MIN_DELTA_PCT;
      const changedSection = heading !== last.heading;
      if (!movedEnough && !changedSection) return;
      if (now - last.at < MIN_INTERVAL_MS) return;

      lastSent.current = { at: now, pct: rounded, heading };
      apiService
        .post(`/elearning/my/items/${itemId}/position`, {
          course_id: courseId,
          scroll_pct: rounded,
          heading,
        })
        .catch(() => undefined); // never let a presence ping surface to a reader
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(report);
    };

    const target: HTMLElement | Window = containerRef?.current ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    // An opening report, so a teacher sees the top of the page immediately
    // rather than only once the student starts moving.
    const opening = setTimeout(() => {
      lastSent.current.at = 0;
      report();
    }, 800);

    return () => {
      clearTimeout(opening);
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("scroll", onScroll);
    };
  }, [courseId, itemId, containerRef, enabled]);
};
