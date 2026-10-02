import { useSyncExternalStore } from "react";

/** The Study Assistant the note reader has open on the right. `docked` is its width in px
 *  when it sits beside the page (the page makes room for it); `covering` means it floats
 *  over the page instead (narrow screens, or not enough room beside the page). The course
 *  page reads this to keep its floating bottom bar off the panel, and to fold its week
 *  index so the page keeps a readable width while the panel is open. */
export interface ReaderAside {
  open: boolean;
  docked: number;
  covering: boolean;
}

const CLOSED: ReaderAside = { open: false, docked: 0, covering: false };
let state: ReaderAside = CLOSED;
const listeners = new Set<() => void>();

export const setReaderAside = (next: ReaderAside | null) => {
  const value = next ?? CLOSED;
  if (value.open === state.open && value.docked === state.docked && value.covering === state.covering) return;
  state = value.open ? value : CLOSED;
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useReaderAside = () => useSyncExternalStore(subscribe, () => state, () => CLOSED);
