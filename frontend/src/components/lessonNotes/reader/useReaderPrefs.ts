import { useCallback, useEffect, useState } from "react";

/**
 * "auto" follows the app's own light/dark setting — the default, so a student
 * who never opens the settings menu reads on white in light mode and on a dark
 * surface in dark mode. The other three are explicit overrides that stay put
 * whatever the app theme does.
 */
export type ReaderPaper = "auto" | "paper" | "sepia" | "night";
/**
 * "reading" is Atkinson Hyperlegible — drawn by the Braille Institute for
 * low-vision readers, so its letterforms are deliberately unambiguous (b/d,
 * p/q, I/l/1, O/0 are all distinct) and its x-height is large. That makes it
 * the right default for a page students read for twenty minutes at a time;
 * Inter and Georgia stay available for anyone who prefers them.
 */
export type ReaderFont = "reading" | "serif" | "sans";
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
  // 1 = the platform body size. The reader used to open at 1.15, so the size
  // control read "115%" before anyone had touched it — a default should read
  // as 100%, and a student who wants larger text can still walk it up.
  fontScale: 0.8,
  lineHeight: 1.75,
  font: "reading",
  paper: "auto",
  mode: "scroll",
};

// Bumped when a default changes in a way stored prefs would otherwise mask — v1 defaulted
// the body to a serif face, and readers who never opened the settings menu would keep it
// forever otherwise. Serif is still offered, it's just no longer the default.
// v3: the default paper became "auto" (follow the app theme) and the default
// text size came down to 100%; both are invisible to anyone holding a v2 blob.
// v4: the default face became Atkinson Hyperlegible and the default size 80%.
const STORAGE_KEY = "lessonNoteReader.prefs.v4";

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
export const readingPositionKey = (noteId: number | string) =>
  `lessonNoteReader.pos.${noteId}`;
