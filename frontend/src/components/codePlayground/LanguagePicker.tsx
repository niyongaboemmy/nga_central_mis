import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Globe,
  Keyboard,
  Search,
  Server,
  X,
} from "lucide-react";
import {
  LANGUAGES,
  isRunnable,
  languageMatches,
  type PlaygroundLanguage,
} from "./languages";

/**
 * The playground's language menu: a search box on top (type "py", "c#", "sqlite", ".rs"…),
 * the languages you used last, then the ones that run in the browser and on the code runner.
 * ↑/↓ move, Enter picks, Esc closes — focus stays in the search box all along (combobox).
 */
export interface LanguagePickerProps {
  value: PlaygroundLanguage;
  /** The runner's language keys (null while they load). */
  runnerKeys: Set<string> | null;
  /** Whether the runner can run programs live (answer input while they run). */
  interactive?: boolean;
  onPick: (lang: PlaygroundLanguage) => void;
}

const RECENT_KEY = "codePlayground.recentLanguages";
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const remember = (id: string) => {
  try {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 4)),
    );
  } catch {
    /* private mode: no recents */
  }
};

interface Group {
  key: string;
  title: string;
  icon: React.ReactNode;
  items: PlaygroundLanguage[];
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({
  value,
  runnerKeys,
  interactive,
  onPick,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  /** How far left the menu moves so it stays on screen (the button can sit mid-bar on a phone). */
  const [shift, setShift] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");

  const groups = useMemo<Group[]>(() => {
    const q = query.trim();
    const all = LANGUAGES.filter((l) => languageMatches(l, q));
    const recent = q
      ? []
      : readRecent()
          .map((id) => LANGUAGES.find((l) => l.id === id))
          .filter((l): l is PlaygroundLanguage => !!l && l.id !== value.id)
          .slice(0, 3);
    const gs: Group[] = [
      {
        key: "recent",
        title: "Recently used",
        icon: <Clock className="w-3 h-3" />,
        items: recent,
      },
      {
        key: "browser",
        title: "Runs in your browser",
        icon: <Globe className="w-3 h-3" />,
        items: all.filter((l) => l.browser),
      },
      {
        key: "server",
        title: "Runs on the code runner",
        icon: <Server className="w-3 h-3" />,
        items: all.filter((l) => !l.browser),
      },
    ];
    return gs.filter((g) => g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, value.id, open]);
  const flat = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items.map((l) => ({ l, key: `${g.key}-${l.id}` })),
      ),
    [groups],
  );
  /** The highlighted option, always one that is shown. */
  const current = flat.length ? Math.min(active, flat.length - 1) : -1;
  // Typing: the first match is the one Enter picks (set with the keystroke, so a quick Enter gets it).
  const search = (q: string) => {
    setQuery(q);
    setActive(0);
  };

  const close = (refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };
  const pick = (l: PlaygroundLanguage) => {
    remember(l.id);
    close();
    onPick(l);
  };

  // Opening: start on the current language, cursor in the search box.
  useEffect(() => {
    if (!open) return;
    const i = flat.findIndex((x) => x.l.id === value.id);
    setActive(i < 0 ? 0 : i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Keep the highlighted option in view.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [current, open]);
  useLayoutEffect(() => {
    if (!open || !boxRef.current) return;
    const left = boxRef.current.getBoundingClientRect().left;
    const width = Math.min(340, window.innerWidth - 32);
    setShift(Math.min(0, window.innerWidth - 16 - width - left));
  }, [open]);
  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !boxRef.current?.contains(e.target as Node) && close(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(() => (flat.length ? (current + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(() =>
        flat.length ? (current - 1 + flat.length) % flat.length : 0,
      );
    } else if (e.key === "Home" && !query) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && !query) {
      e.preventDefault();
      setActive(Math.max(0, flat.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (current >= 0) pick(flat[current].l);
    } else if (e.key === "Escape") {
      // Esc here closes the menu, not the modal around it.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (query) search("");
      else close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  let index = -1;
  return (
    <div ref={boxRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (
            !open &&
            (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change language"
        className="inline-flex items-center gap-2 h-8 pl-2 pr-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-semibold text-slate-800 dark:text-slate-100 hover:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/50 outline-none transition-colors"
        data-testid="playground-language"
      >
        <span className="inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded bg-brand-50 dark:bg-brand-500/20 text-[10px] font-bold text-brand-700 dark:text-brand-200">
          {value.short}
        </span>
        <span className="hidden sm:inline max-w-[180px] truncate">
          {value.label}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className="absolute z-40 mt-1.5 left-0 w-[min(340px,calc(100vw-32px))] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-2xl ring-1 ring-black/5 overflow-hidden animate-[fadeIn_.12s_ease-out]"
          onKeyDown={onKeyDown}
          style={{ left: shift }}
        >
          <div className="flex items-center gap-2 px-3 h-11 border-b border-slate-100 dark:border-white/10">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search languages…"
              // Focused as it appears, so the first key typed already searches.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-activedescendant={
                current >= 0 ? `${uid}-${flat[current].key}` : undefined
              }
              aria-autocomplete="list"
              aria-label="Search languages"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              data-testid="playground-language-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => (search(""), inputRef.current?.focus())}
                aria-label="Clear search"
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            aria-label="Language"
            className="max-h-[min(60vh,420px)] overflow-auto p-1.5 overscroll-contain"
          >
            {!flat.length && (
              <p
                className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
                data-testid="playground-language-empty"
              >
                No language matches “{query.trim()}”.
              </p>
            )}
            {groups.map((g) => (
              <div
                key={g.key}
                role="group"
                aria-label={g.title}
                className="py-1"
              >
                <p className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {g.icon}
                  {g.title}
                </p>
                {g.items.map((l) => {
                  index += 1;
                  const i = index;
                  const key = `${g.key}-${l.id}`;
                  const ok = isRunnable(l, runnerKeys);
                  const selected = l.id === value.id;
                  const hot = i === current;
                  return (
                    <div
                      key={key}
                      id={`${uid}-${key}`}
                      role="option"
                      aria-selected={selected}
                      data-index={i}
                      data-language={l.id}
                      onMouseMove={() => !hot && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(l)}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer text-[13px] ${
                        hot ? "bg-slate-100 dark:bg-white/10" : ""
                      } ${selected ? "text-brand-700 dark:text-brand-200 font-semibold" : "text-slate-700 dark:text-slate-200"}`}
                    >
                      <span
                        className={`inline-flex items-center justify-center h-6 min-w-[34px] px-1 rounded-md text-[10px] font-bold ${
                          selected
                            ? "bg-brand-100 dark:bg-brand-500/25 text-brand-700 dark:text-brand-100"
                            : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {l.short}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{l.label}</span>
                        <span className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                          {l.file}
                          {l.browser
                            ? " · instant"
                            : ok
                              ? l.stdin && interactive
                                ? " · answers input live"
                                : l.stdin
                                  ? " · reads input"
                                  : ""
                              : " · not on the runner yet"}
                        </span>
                      </span>
                      {!l.browser && l.stdin && interactive && ok && (
                        <Keyboard
                          className="w-3.5 h-3.5 text-slate-400 shrink-0"
                          aria-hidden
                        />
                      )}
                      {selected && (
                        <Check className="w-4 h-4 shrink-0" aria-hidden />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-3 px-3 h-8 border-t border-slate-100 dark:border-white/10 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              <kbd className="font-sans">↑</kbd>{" "}
              <kbd className="font-sans">↓</kbd> move
            </span>
            <span>
              <kbd className="font-sans">Enter</kbd> pick
            </span>
            <span>
              <kbd className="font-sans">Esc</kbd> close
            </span>
            <span className="flex-1 text-right">
              {LANGUAGES.length} languages
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguagePicker;
