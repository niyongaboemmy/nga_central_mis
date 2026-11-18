import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Search, X } from "lucide-react";
import UserAvatar from "../ui/UserAvatar";
import { sideProjectsApi, type Category } from "../../api/sideProjects";
import { CATEGORY_ICON, FieldError, inputCls, inputErrCls, Spinner } from "./ui";

/** Shared client-side checks — the same limits the server enforces. */
export const GITHUB_RE = /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}\/?$/;
export const normaliseGithub = (s: string) => {
  let v = s.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  if (/^github\.com\//i.test(v)) v = `https://${v}`;
  return v;
};
export const checkGithub = (s: string) => (!s.trim() ? null : GITHUB_RE.test(normaliseGithub(s)) ? null : "Use https://github.com/owner/repo");
export const checkHttps = (s: string) => {
  if (!s.trim()) return null;
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" && u.hostname.includes(".") ? null : "Links start with https://";
  } catch {
    return "That isn't a valid link";
  }
};

/** Character counter as a tiny ring that fills toward the minimum, then turns green. */
export const CharMeter: React.FC<{ value: string; min: number; max: number }> = ({ value, min, max }) => {
  const n = value.trim().length;
  const ok = n >= min && n <= max;
  const pct = Math.min(100, (n / Math.max(min, 1)) * 100);
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-slate-500 dark:text-gray-400" aria-live="polite">
      <svg width="18" height="18" className="-rotate-90" aria-hidden>
        <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" className="stroke-slate-200 dark:stroke-gray-700" />
        <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" stroke={n > max ? "#d03b3b" : ok ? "#0ca30c" : "#3b6cff"} strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} />
      </svg>
      {n < min ? `${min - n}` : `${n}/${max}`}
    </span>
  );
};

export const CategoryPicker: React.FC<{ categories: Category[]; value: number | null; onChange: (id: number | null) => void }> = ({ categories, value, onChange }) => (
  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Category">
    {categories.map((c) => {
      const Icon = CATEGORY_ICON[c.icon] ?? CATEGORY_ICON.sparkles;
      const on = value === c.id;
      return (
        <motion.button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={on}
          whileTap={{ scale: 0.95 }}
          onClick={() => onChange(on ? null : c.id)}
          className={`group relative flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-3 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            on ? "bg-white text-slate-900 dark:bg-gray-800/60 dark:text-white" : "border-slate-900/[0.07] bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-900/20 dark:border-white/10 dark:bg-gray-800/30 dark:text-gray-300 dark:hover:border-white/20"
          }`}
          style={on ? { borderColor: c.color } : undefined}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full transition" style={{ backgroundColor: on ? c.color : `${c.color}17`, color: on ? "#fff" : c.color }}>
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="text-center leading-tight">{c.name}</span>
          {on && (
            <motion.span layoutId="cat-check" className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ backgroundColor: c.color }}>
              <Check className="h-2.5 w-2.5" />
            </motion.span>
          )}
        </motion.button>
      );
    })}
  </div>
);

export const TagInput: React.FC<{ value: string[]; onChange: (v: string[]) => void; max?: number }> = ({ value, onChange, max = 15 }) => {
  const [text, setText] = useState("");
  const [sugg, setSugg] = useState<string[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      sideProjectsApi.tags(text).then(setSugg).catch(() => setSugg([]));
    }, 200);
    return () => clearTimeout(t);
  }, [text]);
  const add = (t: string) => {
    const s = t.trim().replace(/,$/, "").slice(0, 30);
    if (!s || value.some((v) => v.toLowerCase() === s.toLowerCase()) || value.length >= max) return;
    onChange([...value, s]);
    setText("");
  };
  const shown = sugg.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <div>
      <div className={`${inputCls} flex flex-wrap items-center gap-1.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15`}>
        {value.map((t) => (
          <motion.span key={t} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/30">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))} className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/30">
              <X className="h-3 w-3" />
            </button>
          </motion.span>
        ))}
        <input
          value={text}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          placeholder={value.length ? "" : "React, Arduino, Python…"}
          aria-label="Technologies"
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {shown.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500 dark:text-gray-400">Popular:</span>
          {shown.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-slate-900/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-solid hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:text-gray-300 dark:hover:bg-blue-500/10">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Search-as-you-type person picker (staff for supervisors, classmates for teams). */
type Person = { id: number; name: string; regNumber?: string | null; type?: string };
export const TYPE_LABEL: Record<string, string> = { STUDENT: "Student", TEACHER: "Teacher", STAFF: "Staff", ADMIN: "Admin", PARENT: "Parent" };

export const PersonPicker: React.FC<{
  value: { id: number; name: string } | null;
  onChange: (v: Person | null) => void;
  search: (q: string) => Promise<Person[]>;
  placeholder: string;
  error?: string | null;
}> = ({ value, onChange, search, placeholder, error }) => {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Person[]>([]);
  const [active, setActive] = useState(0);
  const listId = React.useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setBusy(true);
    const t = setTimeout(() => {
      search(q)
        .then(setList)
        .catch(() => setList([]))
        .finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q, open, search]);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (value) {
    return (
      <div className={`${inputCls} flex items-center gap-2`}>
        <UserAvatar name={value.name} userId={value.id} size={24} decorative />
        <span className="flex-1 truncate font-medium">{value.name}</span>
        <button type="button" aria-label="Clear" onClick={() => onChange(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:text-gray-500 dark:hover:text-gray-200">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  const pick = (p: Person) => {
    onChange(p);
    setOpen(false);
    setQ("");
  };
  const show = open && (busy || list.length > 0 || q.trim().length > 0);
  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-gray-500" aria-hidden />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => (setQ(e.target.value), setOpen(true), setActive(0))}
          onKeyDown={(e) => {
            if (!open || !list.length) return;
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => Math.min(list.length - 1, i + 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => Math.max(0, i - 1)));
            else if (e.key === "Enter") (e.preventDefault(), list[active] && pick(list[active]));
            else if (e.key === "Escape") (e.stopPropagation(), setOpen(false));
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-activedescendant={show && list[active] ? `${listId}-${list[active].id}` : undefined}
          aria-autocomplete="list"
          className={`${inputCls} pl-11 ${error ? inputErrCls : ""}`}
        />
        {busy && open && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      </div>
      {show && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-white dark:border-white/10 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-slate-900/[0.05] px-3.5 py-2 text-[11px] font-semibold text-slate-500 dark:border-white/[0.06] dark:text-gray-400">
            <span>{q.trim() ? "Matching people" : "People"}</span>
            {!busy && list.length > 0 && <span className="tabular-nums">{list.length}</span>}
          </div>
          {busy && !list.length ? (
            <div className="space-y-1.5 p-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-1.5">
                  <span className="h-8 w-8 animate-pulse rounded-full bg-slate-100 dark:bg-gray-800" />
                  <span className="h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-slate-500 dark:text-gray-400">No one matches “{q.trim()}”</p>
          ) : (
            <ul role="listbox" id={listId} aria-label="People" className="max-h-72 overflow-y-auto p-1.5">
              {list.map((p, i) => {
                const name = p.name?.trim() || "Unnamed account";
                const sub = [p.regNumber, p.type ? TYPE_LABEL[p.type] ?? p.type : null].filter(Boolean).join(" · ");
                return (
                  <li
                    key={p.id}
                    id={`${listId}-${p.id}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(p)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${i === active ? "bg-blue-50 dark:bg-blue-500/15" : "hover:bg-slate-50 dark:hover:bg-gray-800"}`}
                  >
                      <UserAvatar name={name} userId={p.id} size={32} decorative />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-semibold ${p.name?.trim() ? "text-slate-800 dark:text-gray-100" : "italic text-slate-600 dark:text-gray-300"}`}>{name}</span>
                        {sub && <span className="block truncate font-mono text-[11px] text-slate-600 dark:text-gray-300">{sub}</span>}
                      </span>
                      {i === active && <span className="hidden text-[10px] font-semibold text-blue-700 sm:inline dark:text-blue-300">Enter ↵</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <FieldError message={error} />
    </div>
  );
};
