import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

/**
 * The app's select: a drop-in replacement for a native <select>.
 *
 *   <SelectField id="x" className={inputCls} value={v} onChange={(e) => set(e.target.value)}>
 *     <option value="">Any</option>
 *     ...
 *   </SelectField>
 *
 * A visually hidden native <select> stays the source of truth -- value, name,
 * required, form submission, <label htmlFor>, onChange(e.target.value) and
 * testing-library's selectOptions all work unchanged -- while the visible
 * control is a combobox button that opens a themed, searchable listbox
 * (a bottom sheet on phones). Picking an option sets the native value and
 * dispatches a real "change" event, so callers see an ordinary ChangeEvent.
 *
 * Options may carry `data-description` (second line) and `data-color`
 * (a colour dot), e.g. <option value={id} data-color={subject.color}>.
 */
export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Show the search box: true, false, or "auto" (more than 7 options). */
  searchable?: boolean | "auto";
  searchPlaceholder?: string;
  /** Class for the visible trigger when `className` is not given. */
  placeholderClassName?: string;
}

interface Opt {
  value: string;
  label: string;
  description: string;
  color: string;
  disabled: boolean;
  group: string;
}

const readOptions = (el: HTMLSelectElement | null): Opt[] =>
  el
    ? Array.from(el.options).map((o) => ({
        value: o.value,
        label: o.text,
        description: o.dataset.description ?? "",
        color: o.dataset.color ?? "",
        disabled: o.disabled,
        group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : "",
      }))
    : [];

const normalise = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DEFAULT_TRIGGER =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const setNativeValue = (el: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { className, style, children, searchable = "auto", searchPlaceholder = "Search…", placeholderClassName, title, disabled, ...rest },
  forwardedRef,
) {
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const autoId = useId();
  const listId = `${autoId}-list`;
  const [options, setOptions] = useState<Opt[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [labelText, setLabelText] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean; maxHeight: number } | null>(null);
  const [sheet, setSheet] = useState(false);

  const setRefs = useCallback(
    (el: HTMLSelectElement | null) => {
      selectRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLSelectElement | null>).current = el;
    },
    [forwardedRef],
  );

  // Mirror the native select after every render (options may be conditional, mapped, async).
  const snapshot = useRef("");
  useLayoutEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    const opts = readOptions(el);
    const key = JSON.stringify([opts, el.selectedIndex]);
    if (key !== snapshot.current) {
      snapshot.current = key;
      setOptions(opts);
      setSelectedIndex(el.selectedIndex);
    }
    if (!rest["aria-label"] && !rest["aria-labelledby"]) {
      const id = el.id;
      const escaped = id ? (window.CSS?.escape ? window.CSS.escape(id) : id.replace(/["\\]/g, "\\$&")) : "";
      const label =
        (id ? document.querySelector<HTMLLabelElement>(`label[for="${escaped}"]`) : null) ??
        el.closest("label") ??
        el.parentElement?.querySelector<HTMLLabelElement>(":scope > label:not([for])") ??
        null;
      const text = label?.textContent?.trim() ?? "";
      if (text !== labelText) setLabelText(text);
    }
  });

  // Uncontrolled selects (defaultValue) change without a re-render.
  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    const sync = () => {
      setSelectedIndex(el.selectedIndex);
      snapshot.current = "";
    };
    el.addEventListener("change", sync);
    return () => el.removeEventListener("change", sync);
  }, []);

  const showSearch = searchable === true || (searchable === "auto" && options.length > 7);
  const filtered = useMemo(() => {
    const q = normalise(query.trim());
    const list = options.map((o, index) => ({ ...o, index }));
    return q ? list.filter((o) => normalise(`${o.label} ${o.description}`).includes(q)) : list;
  }, [options, query]);

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vh = window.innerHeight;
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 260 && above > below;
    const width = Math.min(Math.max(r.width, 240), window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setRect({ top: up ? r.top - 6 : r.bottom + 6, left, width, up, maxHeight: Math.max(160, Math.min(380, up ? above : below)) });
  }, []);

  const openList = useCallback(
    (seed = "") => {
      if (disabled) return;
      setSheet(window.matchMedia?.("(max-width: 639px)").matches ?? false);
      setQuery(seed);
      setActive(Math.max(0, selectedIndex));
      place();
      setOpen(true);
    },
    [disabled, place, selectedIndex],
  );

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }, []);

  const choose = (index: number) => {
    const o = options[index];
    const el = selectRef.current;
    if (!o || o.disabled || !el) return;
    if (el.selectedIndex !== index) setNativeValue(el, o.value);
    setSelectedIndex(el.selectedIndex);
    close();
  };

  // Keep the active row in range and visible.
  useEffect(() => {
    if (!open) return;
    const pos = filtered.findIndex((o) => o.index === active);
    if (pos === -1 && filtered.length) setActive(filtered.find((o) => !o.disabled)?.index ?? filtered[0].index);
  }, [filtered, active, open]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => (showSearch ? searchRef.current : listRef.current)?.focus(), 0);
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onMove = () => (sheet ? undefined : place());
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, showSearch, close, place, sheet]);

  const move = (delta: number) => {
    const enabled = filtered.filter((o) => !o.disabled);
    if (!enabled.length) return;
    const pos = enabled.findIndex((o) => o.index === active);
    const next = pos === -1 ? (delta > 0 ? 0 : enabled.length - 1) : Math.min(enabled.length - 1, Math.max(0, pos + delta));
    setActive(enabled[next].index);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "PageDown":
        e.preventDefault();
        move(8);
        break;
      case "PageUp":
        e.preventDefault();
        move(-8);
        break;
      case "Home":
        if (e.target === searchRef.current) break;
        e.preventDefault();
        move(-Infinity);
        break;
      case "End":
        if (e.target === searchRef.current) break;
        e.preventDefault();
        move(Infinity);
        break;
      case "Enter":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        // Close the list only -- not the dialog around it.
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        // Typeahead when there is no search box.
        if (!showSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const k = normalise(e.key);
          const start = filtered.findIndex((o) => o.index === active);
          const order = [...filtered.slice(start + 1), ...filtered.slice(0, start + 1)];
          const hit = order.find((o) => !o.disabled && normalise(o.label).startsWith(k));
          if (hit) setActive(hit.index);
        }
    }
  };

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", " ", "F4"].includes(e.key) || (e.altKey && e.key === "ArrowDown")) {
      e.preventDefault();
      openList();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (showSearch) openList(e.key);
      else {
        const k = normalise(e.key);
        const hit = options.findIndex((o, i) => i > selectedIndex && !o.disabled && normalise(o.label).startsWith(k));
        const wrap = hit === -1 ? options.findIndex((o) => !o.disabled && normalise(o.label).startsWith(k)) : hit;
        if (wrap !== -1 && selectRef.current) {
          setNativeValue(selectRef.current, options[wrap].value);
          setSelectedIndex(selectRef.current.selectedIndex);
        }
      }
    }
  };

  const current = options[selectedIndex];
  const isPlaceholder = !current || current.value === "";
  const ariaLabel = (rest["aria-label"] as string | undefined) ?? (labelText || undefined);

  const list = (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      tabIndex={-1}
      aria-label={ariaLabel}
      aria-activedescendant={open ? `${listId}-${active}` : undefined}
      onKeyDown={showSearch ? undefined : onListKey}
      className="overflow-y-auto overscroll-contain p-1.5 focus:outline-none"
      style={{ maxHeight: sheet ? "60vh" : rect ? rect.maxHeight - (showSearch ? 52 : 0) : 300 }}
    >
      {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No matches for “{query}”</li>}
      {filtered.map((o, i) => {
        const selected = o.index === selectedIndex;
        const isActive = o.index === active;
        const showGroup = o.group && (i === 0 || filtered[i - 1].group !== o.group);
        return (
          <React.Fragment key={`${o.index}-${o.value}`}>
            {showGroup && (
              <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {o.group}
              </li>
            )}
            <li
              id={`${listId}-${o.index}`}
              data-index={o.index}
              role="option"
              aria-selected={selected}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => !o.disabled && setActive(o.index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o.index)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                o.disabled
                  ? "cursor-not-allowed opacity-40"
                  : isActive
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-700/70 dark:text-white"
                    : "text-slate-800 dark:text-slate-100"
              } ${selected ? "font-semibold" : ""}`}
            >
              {o.color && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10" style={{ background: o.color }} aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${o.value === "" ? "text-slate-500 dark:text-slate-400" : ""}`}>{o.label || " "}</span>
                {o.description && <span className="block truncate text-xs font-normal text-slate-500 dark:text-slate-400">{o.description}</span>}
              </span>
              {selected && <Check className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />}
            </li>
          </React.Fragment>
        );
      })}
    </ul>
  );

  const search = showSearch && (
    <div className="relative border-b border-slate-200 p-2 dark:border-slate-700">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        ref={searchRef}
        type="text"
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={`${listId}-${active}`}
        aria-label={ariaLabel ? `Search ${ariaLabel}` : "Search options"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onListKey}
        placeholder={searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-lg border-0 bg-slate-100 py-2 pl-8 pr-8 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );

  const popover =
    open &&
    createPortal(
      sheet ? (
        <div className="fixed inset-0 z-[1000] flex items-end bg-black/40 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel}
            className="w-full overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:border-slate-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <span className="mx-auto h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
            </div>
            {ariaLabel && <p className="px-4 pb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{ariaLabel}</p>}
            {search}
            {list}
          </div>
        </div>
      ) : (
        <div
          ref={popRef}
          className="fixed z-[1000] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/40"
          style={
            rect
              ? { left: rect.left, width: rect.width, ...(rect.up ? { bottom: window.innerHeight - rect.top } : { top: rect.top }) }
              : undefined
          }
          onClick={(e) => e.stopPropagation()}
        >
          {search}
          {list}
        </div>
      ),
      document.body,
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={rest["aria-labelledby"]}
        aria-describedby={rest["aria-describedby"]}
        aria-invalid={rest["aria-invalid"]}
        aria-required={rest.required || undefined}
        title={title}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
        style={style}
        className={`${className ?? placeholderClassName ?? DEFAULT_TRIGGER} inline-flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50`}
      >
        <span className={`flex min-w-0 flex-1 items-center gap-2 truncate ${isPlaceholder ? "opacity-70" : ""}`}>
          {current?.color && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10" style={{ background: current.color }} aria-hidden />}
          <span className="truncate">{current?.label || " "}</span>
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <select
        {...rest}
        ref={setRefs}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onFocus={(e) => {
          rest.onFocus?.(e);
          triggerRef.current?.focus();
        }}
      >
        {children}
      </select>
      {popover}
    </>
  );
});

export default SelectField;
