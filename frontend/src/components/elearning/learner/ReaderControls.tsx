import React, { useEffect, useRef, useState } from "react";
import { AArrowDown, AArrowUp, Check, Settings2 } from "lucide-react";
import {
  ReaderFont,
  ReaderPaper,
  ReaderPrefs,
} from "../../lessonNotes/reader/useReaderPrefs";

/** The size range the A−/A+ buttons walk. 1 is the platform default body size.
 *  The floor sits below the 0.8 default so A− still has somewhere to go. */
export const FONT_SCALE_MIN = 0.7;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_STEP = 0.1;

const PAPERS: { value: ReaderPaper; label: string; swatch: string }[] = [
  // Auto first: it is the default, and it is what most readers should stay on.
  {
    value: "auto",
    label: "Auto",
    swatch: "linear-gradient(135deg,#ffffff 50%,#14181f 50%)",
  },
  { value: "paper", label: "Paper", swatch: "#ffffff" },
  { value: "sepia", label: "Sepia", swatch: "#f6efe1" },
  { value: "night", label: "Night", swatch: "#14181f" },
];

const FONTS: { value: ReaderFont; label: string; className: string }[] = [
  // Reading first: it is the default and the most legible of the three.
  { value: "reading", label: "Reading", className: "font-reading" },
  { value: "sans", label: "Sans", className: "font-sans" },
  { value: "serif", label: "Serif", className: "font-serif" },
];

/**
 * Text size, background and typeface for the lesson reader — the same three controls the
 * lesson-note reader has, reading and writing the same stored preferences, so a student
 * sets their reading comfort once and every reader in the app obeys it.
 *
 * A− / A+ sit outside the menu because text size is the control people reach for most,
 * and burying it behind a popover is what made the reader feel fixed at one size.
 */
const ReaderControls: React.FC<{
  prefs: ReaderPrefs;
  update: <K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) => void;
  /** Rendered at the end of the row (e.g. the focus-mode toggle), so the reader has one
   *  tool strip rather than a floating pill competing with the page title. */
  trailing?: React.ReactNode;
}> = ({ prefs, update, trailing }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setScale = (delta: number) =>
    update(
      "fontScale",
      Math.min(
        FONT_SCALE_MAX,
        Math.max(FONT_SCALE_MIN, Number((prefs.fontScale + delta).toFixed(2))),
      ),
    );

  const pct = Math.round(prefs.fontScale * 100);

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <div
        className="flex items-center rounded-pill el-chip p-0.5"
        role="group"
        aria-label="Text size"
      >
        <button
          onClick={() => setScale(-FONT_SCALE_STEP)}
          disabled={prefs.fontScale <= FONT_SCALE_MIN}
          aria-label="Smaller text"
          title="Smaller text"
          className="w-9 h-9 flex items-center justify-center rounded-pill text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/[0.10] disabled:opacity-30 focus:outline-none focus-visible:shadow-glow transition-colors"
        >
          <AArrowDown className="w-4 h-4" />
        </button>
        <span className="px-1 text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300 w-10 text-center">
          {pct}%
        </span>
        <button
          onClick={() => setScale(FONT_SCALE_STEP)}
          disabled={prefs.fontScale >= FONT_SCALE_MAX}
          aria-label="Larger text"
          title="Larger text"
          className="w-9 h-9 flex items-center justify-center rounded-pill text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/[0.10] disabled:opacity-30 focus:outline-none focus-visible:shadow-glow transition-colors"
        >
          <AArrowUp className="w-4 h-4" />
        </button>
      </div>

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Reading settings"
          title="Reading settings"
          className="w-9 h-9 flex items-center justify-center rounded-pill el-chip text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.10] focus:outline-none focus-visible:shadow-glow transition-colors"
        >
          <Settings2 className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 w-60 p-3 rounded-2xl el-float">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">
              Background
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {PAPERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => update("paper", p.value)}
                  aria-pressed={prefs.paper === p.value}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[11px] font-medium transition-all ${
                    prefs.paper === p.value
                      ? "border-brand-500 text-brand-700 dark:text-brand-200"
                      : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-md border border-black/10 dark:border-white/20"
                    style={{ background: p.swatch }}
                    aria-hidden
                  />
                  {p.label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">
              Typeface
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {FONTS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => update("font", f.value)}
                  aria-pressed={prefs.font === f.value}
                  className={`flex items-center justify-center gap-1 p-2 rounded-xl border text-sm transition-all ${f.className} ${
                    prefs.font === f.value
                      ? "border-brand-500 text-brand-700 dark:text-brand-200"
                      : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {prefs.font === f.value && <Check className="w-3 h-3" />}
                  {f.label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">
              Line spacing
            </p>
            <input
              type="range"
              min={1.4}
              max={2.1}
              step={0.05}
              value={prefs.lineHeight}
              onChange={(e) => update("lineHeight", Number(e.target.value))}
              aria-label="Line spacing"
              className="mt-2 w-full accent-brand-500"
            />
          </div>
        )}
      </div>

      {trailing}
    </div>
  );
};

export default ReaderControls;
