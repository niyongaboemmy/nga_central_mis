import { useCallback, useEffect, useRef, useState } from "react";
import { applyFindMarks, clearFindMarks, setActiveFindMark, MIN_FIND_LENGTH } from "./findInNote";

interface Options {
  /** The element holding the rendered note HTML. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Find only runs while the find bar is open. */
  enabled: boolean;
  query: string;
  /** Bring a hit into view — a scroll in scroll mode, a page jump in book mode. */
  onReveal: (hit: HTMLElement) => void;
  /** Marks change the flow's length, so a paginated reader must re-measure after each run. */
  onMarksChanged?: () => void;
  /** Re-run when this changes (e.g. the note content finished loading). */
  contentKey?: unknown;
}

/** Find-in-note state, shared by the single-note reader and the combined reader.
 *  The DOM marks it creates are always unwound — on close, on re-query, and on unmount. */
export const useNoteFind = ({ containerRef, enabled, query, onReveal, onMarksChanged, contentKey }: Options) => {
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const hits = useRef<HTMLElement[]>([]);
  // Kept in refs so the debounced effect below doesn't re-fire every time a caller
  // re-creates these callbacks on render.
  const revealRef = useRef(onReveal);
  const changedRef = useRef(onMarksChanged);
  revealRef.current = onReveal;
  changedRef.current = onMarksChanged;

  useEffect(() => {
    if (!enabled) {
      clearFindMarks(containerRef.current);
      hits.current = [];
      setCount(0);
      setIndex(0);
      return;
    }
    // Debounced so a 5,000-word note isn't re-walked on every keystroke.
    const timer = setTimeout(() => {
      const found = applyFindMarks(containerRef.current, query);
      hits.current = found;
      setCount(found.length);
      setIndex(0);
      if (found.length > 0) {
        setActiveFindMark(found, 0);
        revealRef.current(found[0]);
      }
      changedRef.current?.();
    }, 180);
    return () => clearTimeout(timer);
  }, [query, enabled, contentKey, containerRef]);

  const step = useCallback((delta: number) => {
    const found = hits.current;
    if (found.length === 0) return;
    setIndex((current) => {
      const next = (current + delta + found.length) % found.length;
      setActiveFindMark(found, next);
      revealRef.current(found[next]);
      return next;
    });
  }, []);

  // Marks live in DOM mutated by hand — always unwind them on the way out.
  useEffect(() => () => clearFindMarks(containerRef.current), [containerRef]);

  return { count, index, step, tooShort: query.trim().length < MIN_FIND_LENGTH };
};
