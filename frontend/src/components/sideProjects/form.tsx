import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { CharMeter } from "./fields";
import { FieldError, inputCls, inputErrCls, labelCls } from "./ui";

/**
 * Form modal for side projects: an icon header with a subtitle, an optional band under it
 * (stepper), a scrolling body with even padding, and a footer that stays put while the body
 * scrolls. On phones it becomes a bottom sheet. Accessible like ui/Modal: labelled dialog,
 * Escape closes, focus moves in, Tab stays inside, focus returns to the opener.
 */
export interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  /** Gradient for the header badge (CSS colors). */
  tone?: [string, string];
  band?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
  busy?: boolean;
  children: React.ReactNode;
}

const SIZES = { md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-5xl" };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const FormModal: React.FC<FormModalProps> = ({ open, onClose, title, subtitle, icon: Icon, tone = ["#2563eb", "#2563eb"], band, footer, size = "lg", busy, children }) => {
  const titleId = useId();
  const descId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
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
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      // An explicit [data-autofocus] wins over the first field in document order.
      const firstField = root.querySelector<HTMLElement>("[data-autofocus]") ?? root.querySelector<HTMLElement>("input:not([type=file]):not([disabled]), textarea:not([disabled])");
      (firstField ?? root).focus();
    }, 60);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
      opener?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-6 dark:bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={subtitle ? descId : undefined}
            tabIndex={-1}
            className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-slate-900/[0.06] bg-white focus:outline-none sm:max-h-[88vh] sm:rounded-[28px] dark:border-white/[0.06] dark:bg-gray-900 ${SIZES[size]}`}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden dark:bg-gray-700" aria-hidden />
            <header className="flex items-start gap-4 px-6 pb-4 pt-5 sm:px-8 sm:pt-7">
              {Icon && (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white " style={{ background: `linear-gradient(135deg, ${tone[0]}, ${tone[1]})` }}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id={titleId} className="text-lg font-bold leading-tight text-slate-900 sm:text-xl dark:text-white">
                  {title}
                </h2>
                {subtitle && (
                  <p id={descId} className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                    {subtitle}
                  </p>
                )}
              </div>
              <motion.button
                type="button"
                aria-label="Close"
                onClick={onClose}
                disabled={busy}
                whileHover={{ rotate: 90 }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </motion.button>
            </header>
            {band && <div className="px-6 pb-2 sm:px-8">{band}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">{children}</div>
            {footer && (
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/[0.06] bg-slate-50/80 px-6 py-4 backdrop-blur sm:px-8 dark:border-white/[0.06] dark:bg-gray-800/40">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

/** Label + optional icon, "Optional" tag, counter, hint and error, aligned the same everywhere. */
export const Field: React.FC<{
  label: string;
  htmlFor?: string;
  icon?: React.ElementType;
  optional?: boolean;
  counter?: { value: string; min: number; max: number };
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, icon: Icon, optional, counter, hint, error, className = "", children }) => (
  <div className={className}>
    <div className="flex items-end justify-between gap-2">
      <label htmlFor={htmlFor} className={labelCls}>
        {Icon && <Icon className="h-4 w-4 text-slate-400 dark:text-gray-500" aria-hidden />}
        {label}
        {optional && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-gray-800 dark:text-gray-300">Optional</span>}
      </label>
      {counter && (
        <span className="mb-1.5">
          <CharMeter value={counter.value} min={counter.min} max={counter.max} />
        </span>
      )}
    </div>
    {children}
    {error ? <FieldError message={error} /> : hint ? <p className="mt-1.5 text-xs text-slate-500 dark:text-gray-400">{hint}</p> : null}
  </div>
);

/** Input with a leading icon inside the field. */
export const IconInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ElementType; invalid?: boolean }>(
  ({ icon: Icon, invalid, className = "", ...rest }, ref) => (
    <div className="group relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-500 dark:text-gray-500" aria-hidden />
      <input ref={ref} {...rest} aria-invalid={invalid || undefined} className={`${inputCls} pl-11 ${invalid ? inputErrCls : ""} ${className}`} />
    </div>
  ),
);
IconInput.displayName = "IconInput";

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ invalid, className = "", ...rest }, ref) => (
    <textarea ref={ref} {...rest} aria-invalid={invalid || undefined} className={`${inputCls} min-h-[96px] resize-y leading-relaxed ${invalid ? inputErrCls : ""} ${className}`} />
  ),
);
TextArea.displayName = "TextArea";

/** A titled group of fields inside a form. */
export const FormSection: React.FC<{ title: string; icon?: React.ElementType; children: React.ReactNode; aside?: React.ReactNode }> = ({ title, icon: Icon, children, aside }) => (
  <section className="space-y-4">
    <div className="flex items-center gap-2">
      {Icon && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">{title}</h3>
      <span className="h-px flex-1 bg-slate-200 dark:bg-gray-700/50" aria-hidden />
      {aside}
    </div>
    {children}
  </section>
);

/** Large selectable option cards (radio group). */
export function OptionCards<T extends string>({
  value,
  onChange,
  options,
  label,
  columns = 2,
}: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  columns?: 2 | 3;
  options: Array<{ value: T; title: string; caption?: string; icon: React.ElementType; color?: string }>;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-3 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {options.map((o) => {
        const on = value === o.value;
        const color = o.color ?? "#2563eb";
        return (
          <motion.button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            whileTap={{ scale: 0.98 }}
            className={`relative flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              on ? "bg-white dark:bg-gray-800/60" : "border-slate-900/[0.07] bg-white hover:border-slate-900/20 dark:border-white/10 dark:bg-gray-800/30 dark:hover:border-white/20"
            }`}
            style={on ? { borderColor: color } : undefined}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition" style={{ backgroundColor: on ? color : `${color}14`, color: on ? "#fff" : color }}>
              <o.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900 dark:text-white">{o.title}</span>
              {o.caption && <span className="mt-0.5 block text-xs text-slate-500 dark:text-gray-400">{o.caption}</span>}
            </span>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${on ? "border-transparent" : "border-slate-900/10 dark:border-gray-600"}`} style={on ? { backgroundColor: color } : undefined} aria-hidden>
              {on && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
