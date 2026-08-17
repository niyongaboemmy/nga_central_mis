import { useCallback, useEffect, useState } from "react";

export type ReaderPaper = "paper" | "sepia" | "night";
export type ReaderFont = "serif" | "sans";
export type ReaderMode = "scroll" | "book";

export interface ReaderPrefs {
  /** Multiplier on the note's base body size. 1 = the platform default (14px). */
  fontScale: number;
  lineHeight: number;
  font: ReaderFont;
  paper: ReaderPaper;
  mode: ReaderMode;
}

const DEFAULTS: ReaderPrefs = {
  fontScale: 1.15,
  lineHeight: 1.75,
  font: "serif",
  paper: "paper",
  mode: "scroll",
};

const STORAGE_KEY = "lessonNoteReader.prefs";

/** Reading preferences are per-device, not per-account: they describe this screen and this
 *  reader's eyes, so localStorage is the right home and no API round-trip is needed. */
export const useReaderPrefs = () => {
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // A full or blocked localStorage must never break reading.
    }
  }, [prefs]);

  const update = useCallback(
    <K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) =>
      setPrefs((p) => ({ ...p, [key]: value })),
    [],
  );

  const reset = useCallback(() => setPrefs(DEFAULTS), []);

  return { prefs, update, reset };
};

/** Last reading position per note, so re-opening a long note resumes where the student
 *  stopped instead of dumping them back at page one. */
export const readingPositionKey = (noteId: number | string) => `lessonNoteReader.pos.${noteId}`;
