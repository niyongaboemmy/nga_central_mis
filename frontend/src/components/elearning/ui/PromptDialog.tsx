import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X, type LucideIcon } from "lucide-react";
import { useMotion } from "../../../design/motion";

export interface PromptRequest {
  title: string;
  /** One sentence under the title — say what the value is for, not how to type it. */
  detail?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  icon?: LucideIcon;
  inputMode?: "text" | "url";
  /** Return a message to block submission, or null when the value is fine. */
  validate?: (value: string) => string | null;
}

/**
 * The module's own single-field dialog, replacing `window.prompt`: keyboard-first (autofocus,
 * Enter to confirm, Esc to cancel), focus-trapped, animated with the module's motion, and
 * styled like every other surface — a browser prompt is unstyled, unthemed, blocks the page
 * and cannot validate. Driven by `usePrompt()` so callers stay one `await` long.
 */
const PromptDialog: React.FC<{
  request: PromptRequest | null;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}> = ({ request, onCancel, onConfirm }) => {
  const m = useMotion();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.initialValue || "");
    setError(null);
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => clearTimeout(t);
  }, [request]);

  // Focus trap + Esc, so the dialog behaves like a real modal for keyboard and screen readers.
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("button, input, [href], [tabindex]:not([tabindex='-1'])");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onCancel]);

  const submit = () => {
    if (!request) return;
    const trimmed = value.trim();
    const message = request.validate ? request.validate(trimmed) : trimmed ? null : "This can't be empty.";
    if (message) {
      setError(message);
      inputRef.current?.focus();
      return;
    }
    onConfirm(trimmed);
  };

  const Icon = request?.icon;

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            ref={panelRef}
            {...m("reveal")}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={request.title}
            className="w-full max-w-md rounded-3xl el-float p-5"
          >
            <div className="flex items-start gap-3">
              {Icon && (
                <span className="w-10 h-10 rounded-2xl el-chip-brand text-brand-600 dark:text-brand-200 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{request.title}</h2>
                {request.detail && <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">{request.detail}</p>}
              </div>
              <button onClick={onCancel} aria-label="Cancel" className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={request.placeholder}
                inputMode={request.inputMode === "url" ? "url" : "text"}
                aria-invalid={!!error}
                aria-describedby={error ? "prompt-error" : undefined}
                className={`el-input ${error ? "!border-danger-500" : ""}`}
              />
              <AnimatePresence>
                {error && (
                  <motion.p id="prompt-error" {...m("reveal")} className="mt-2 flex items-center gap-1.5 text-[13px] text-danger-700 dark:text-danger-500" role="alert">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="min-h-[44px] px-4 rounded-pill text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5">
                  Cancel
                </button>
                <motion.button
                  {...m("tap")}
                  type="submit"
                  className="min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow"
                >
                  {request.confirmLabel || "Add"}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PromptDialog;

/**
 * `const ask = usePrompt()` → `const url = await ask({ title: "…" })`, resolving to the value
 * or null when cancelled. Render `{promptUI}` once in the component.
 */
export function usePrompt(): [(req: PromptRequest) => Promise<string | null>, React.ReactElement] {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const resolver = useRef<((value: string | null) => void) | null>(null);

  const ask = (req: PromptRequest) =>
    new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setRequest(req);
    });

  const settle = (value: string | null) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  };

  return [ask, <PromptDialog key="prompt" request={request} onCancel={() => settle(null)} onConfirm={(v) => settle(v)} />];
}
