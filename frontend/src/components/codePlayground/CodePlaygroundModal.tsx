import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import PlaygroundWorkbench from "./PlaygroundWorkbench";
import type { PlaygroundRequest } from "./store";

/**
 * The full Code Playground over the page: a large window on desktops (full screen on
 * request), the whole screen on phones. Esc closes it unless an editor popup (the
 * autocomplete list, search) is open — CodeMirror handles that Esc itself.
 */
const CodePlaygroundModal: React.FC<{ request: PlaygroundRequest | null; onClose: () => void }> = ({ request, onClose }) => {
  const [fullscreen, setFullscreen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!request) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.(".cm-tooltip, .cm-panel")) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      // Back to the Run button that opened it.
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [request, onClose]);

  // Keep Tab inside the dialog.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panel.current) return;
    if ((e.target as HTMLElement).closest(".cm-editor")) return; // Tab indents in the editor
    const items = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"]), .cm-content');
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <AnimatePresence>
      {request && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-stretch sm:items-center justify-center sm:p-4 lg:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="code-playground-title"
            onKeyDown={trapTab}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`relative w-full flex flex-col overflow-hidden bg-white dark:bg-[#0d1117] shadow-2xl ${
              fullscreen ? "h-full max-w-none sm:rounded-none" : "h-full sm:h-[min(860px,92vh)] max-w-[1320px] sm:rounded-2xl sm:border border-slate-200 dark:border-white/10"
            }`}
          >
            <PlaygroundWorkbench
              key={JSON.stringify([request.block.language, request.block.code, request.block.title])}
              block={request.block}
              variant="modal"
              autoRun={request.autoRun}
              source={request.source}
              onClose={onClose}
              onSave={
                request.onSave
                  ? (b) => {
                      request.onSave!(b);
                      onClose();
                    }
                  : undefined
              }
              fullscreen={fullscreen}
              onToggleFullscreen={() => setFullscreen((f) => !f)}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default CodePlaygroundModal;
