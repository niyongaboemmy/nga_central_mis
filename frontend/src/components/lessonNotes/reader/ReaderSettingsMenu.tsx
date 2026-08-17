import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlignLeft, Minus, Plus, Settings2 } from "lucide-react";
import { ReaderPaper, ReaderPrefs } from "./useReaderPrefs";

const PAPERS: { key: ReaderPaper; label: string; swatch: string }[] = [
  { key: "paper", label: "Paper", swatch: "bg-white border-gray-300" },
  { key: "sepia", label: "Sepia", swatch: "bg-[#f4ecd8] border-amber-300" },
  { key: "night", label: "Night", swatch: "bg-gray-900 border-gray-600" },
];

const MIN_SCALE = 0.85;
const MAX_SCALE = 1.8;

interface Props {
  prefs: ReaderPrefs;
  update: <K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Text size / typeface / line spacing / paper. Shared by the single-note reader and the
 *  combined reader so both surfaces offer exactly the same reading controls. */
const ReaderSettingsMenu: React.FC<Props> = ({ prefs, update, open, setOpen }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, setOpen]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Reading settings"
        className={`p-2 rounded-lg transition-colors ${
          open
            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        <Settings2 className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.13 }}
            className="absolute right-0 mt-2 w-64 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-3.5 z-40"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Text size</p>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => update("fontScale", Math.max(MIN_SCALE, +(prefs.fontScale - 0.1).toFixed(2)))}
                aria-label="Smaller text"
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                  style={{
                    width: `${((prefs.fontScale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 100}%`,
                  }}
                />
              </div>
              <button
                onClick={() => update("fontScale", Math.min(MAX_SCALE, +(prefs.fontScale + 0.1).toFixed(2)))}
                aria-label="Larger text"
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Typeface</p>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {([
                { key: "serif" as const, label: "Serif", cls: "font-serif" },
                { key: "sans" as const, label: "Sans", cls: "font-sans" },
              ]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => update("font", f.key)}
                  className={`${f.cls} px-3 py-2 rounded-xl text-sm border transition-colors ${
                    prefs.font === f.key
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Line spacing</p>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {[1.55, 1.75, 2.05].map((lh) => (
                <button
                  key={lh}
                  onClick={() => update("lineHeight", lh)}
                  aria-label={`Line spacing ${lh}`}
                  className={`flex items-center justify-center py-2 rounded-xl border transition-colors ${
                    prefs.lineHeight === lh
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300"
                      : "border-gray-200 dark:border-gray-600 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <AlignLeft className="w-3.5 h-3.5" style={{ transform: `scaleY(${lh / 1.75})` }} />
                </button>
              ))}
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Paper</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PAPERS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => update("paper", p.key)}
                  className={`flex flex-col items-center gap-1.5 py-2 rounded-xl border transition-colors ${
                    prefs.paper === p.key
                      ? "border-blue-500 bg-blue-50/60 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-md border ${p.swatch}`} />
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{p.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReaderSettingsMenu;
