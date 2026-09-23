import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, Info, Loader2, X } from "lucide-react";

export type ConfirmTone = "danger" | "warning" | "info";

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  /** Extra consequences, rendered as a bulleted list under the message. */
  details?: string[];
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  /** When set, the confirm button stays disabled until the user types this exactly —
   *  reserved for deletes that destroy other people's work (a whole course, a scheme). */
  confirmationPhrase?: string;
}

/** Icon + colour per tone, so a delete never looks like a neutral "are you sure?". */
const TONES: Record<
  ConfirmTone,
  { Icon: typeof AlertTriangle; badge: string; confirm: string; ring: string }
> = {
  danger: {
    Icon: Trash2,
    badge: "bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-300",
    confirm:
      "bg-red-600 hover:bg-red-500 text-white shadow-sm shadow-red-500/30 hover:shadow-md hover:shadow-red-500/40 focus-visible:ring-red-500/50",
    ring: "focus-visible:ring-red-500/50",
  },
  warning: {
    Icon: AlertTriangle,
    badge: "bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
    confirm:
      "bg-amber-500 hover:bg-amber-400 text-white shadow-sm shadow-amber-500/30 hover:shadow-md hover:shadow-amber-500/40 focus-visible:ring-amber-500/50",
    ring: "focus-visible:ring-amber-500/50",
  },
  info: {
    Icon: Info,
    badge: "bg-blue-100 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300",
    confirm:
      "bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/30 hover:shadow-md hover:shadow-blue-500/40 focus-visible:ring-blue-500/50",
    ring: "focus-visible:ring-blue-500/50",
  },
};

interface Props extends ConfirmOptions {
  isOpen: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The single confirm dialog behind every destructive action. Own surface rather than the
 * generic Modal: that one's `dark:bg-gray-800/30` reads as a washed-out grey pane, and a
 * delete prompt is exactly where the two themes must both be unambiguous.
 *
 * Keyboard: Esc cancels, Enter confirms (unless a confirmation phrase is required), and
 * focus lands on Cancel so a stray Enter never deletes anything.
 */
const ConfirmDialog: React.FC<Props> = ({
  isOpen,
  title,
  message,
  details,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "danger",
  confirmationPhrase,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const { Icon, badge, confirm, ring } = TONES[tone];
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const phraseOk = !confirmationPhrase || typed.trim() === confirmationPhrase;
  const canConfirm = phraseOk && !isLoading;

  useEffect(() => {
    if (isOpen) setTyped("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // Focus Cancel, not Confirm: the safe action is the default one. The exception is a
    // phrase-guarded delete, where the input autoFocuses — stealing focus back here dropped
    // whatever the user had already typed into it.
    const t = confirmationPhrase ? 0 : window.setTimeout(() => cancelRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        e.preventDefault();
        onCancel();
      }
      if (e.key === "Enter" && canConfirm && !confirmationPhrase) {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, isLoading, canConfirm, confirmationPhrase, onCancel, onConfirm]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/70 backdrop-blur-sm"
          onClick={() => !isLoading && onCancel()}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#111725] border border-gray-200 dark:border-white/10 shadow-2xl dark:shadow-[0_24px_70px_-16px_rgb(0_0_0/0.9)] overflow-hidden"
          >
            <button
              onClick={() => !isLoading && onCancel()}
              aria-label="Close"
              className="absolute top-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-5 pr-12">
              <div className="flex items-start gap-3.5">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${badge}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3
                    id="confirm-dialog-title"
                    className="text-base font-bold text-gray-900 dark:text-white"
                  >
                    {title}
                  </h3>
                  {message && (
                    <div className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 leading-relaxed">
                      {message}
                    </div>
                  )}
                  {details && details.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {details.map((d) => (
                        <li
                          key={d}
                          className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400"
                        >
                          <span
                            className={`mt-1.5 w-1 h-1 rounded-full flex-shrink-0 ${
                              tone === "danger" ? "bg-red-400" : tone === "warning" ? "bg-amber-400" : "bg-blue-400"
                            }`}
                          />
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {confirmationPhrase && (
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    Type <span className="font-bold text-gray-700 dark:text-gray-200">{confirmationPhrase}</span> to
                    confirm
                  </label>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                    placeholder={confirmationPhrase}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 bg-gray-50 dark:bg-white/[0.03] border-t border-gray-100 dark:border-white/[0.06]">
              <button
                ref={cancelRef}
                onClick={onCancel}
                disabled={isLoading}
                className={`px-4 py-2.5 text-sm font-semibold rounded-full text-gray-700 dark:text-gray-200 bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 transition-all disabled:opacity-60 ${ring}`}
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={!canConfirm}
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-full focus-visible:outline-none focus-visible:ring-2 transition-all disabled:opacity-50 disabled:shadow-none ${confirm}`}
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default ConfirmDialog;
