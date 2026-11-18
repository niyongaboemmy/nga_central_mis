import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Github, Image as ImageIcon, PartyPopper, Search, Undo2, X } from "lucide-react";
import Modal from "../ui/Modal";
import UserAvatar from "../ui/UserAvatar";
import { sideProjectsApi, type Category, type Status } from "../../api/sideProjects";
import { CATEGORY_ICON, FieldError, inputCls, inputErrCls, labelCls, primaryBtn, secondaryBtn, Spinner, STATUS_META, statusColor, useIsDark } from "./ui";

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
    <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-slate-500 dark:text-slate-400" aria-live="polite">
      <svg width="18" height="18" className="-rotate-90" aria-hidden>
        <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" className="stroke-slate-200 dark:stroke-slate-700" />
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
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(on ? null : c.id)}
          className={`flex flex-col items-center gap-1 rounded-2xl border p-2 text-[11px] font-semibold transition ${
            on ? "border-transparent text-white shadow-md" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          }`}
          style={on ? { backgroundColor: c.color } : undefined}
        >
          <Icon className="h-5 w-5" style={on ? undefined : { color: c.color }} aria-hidden />
          <span className="leading-tight">{c.name}</span>
        </button>
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
      <div className={`${inputCls} flex flex-wrap items-center gap-1.5`}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
              <X className="h-3 w-3" />
            </button>
          </span>
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
        <div className="mt-1.5 flex flex-wrap gap-1">
          {shown.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-lg border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-brand-500 hover:text-brand-700 dark:border-slate-600 dark:text-slate-300">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Search-as-you-type person picker (staff for supervisors, classmates for teams). */
export const PersonPicker: React.FC<{
  value: { id: number; name: string } | null;
  onChange: (v: { id: number; name: string; regNumber?: string } | null) => void;
  search: (q: string) => Promise<Array<{ id: number; name: string; regNumber?: string }>>;
  placeholder: string;
  error?: string | null;
}> = ({ value, onChange, search, placeholder, error }) => {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Array<{ id: number; name: string; regNumber?: string }>>([]);
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
        <button type="button" aria-label="Clear" onClick={() => onChange(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => (setQ(e.target.value), setOpen(true))}
          placeholder={placeholder}
          aria-label={placeholder}
          className={`${inputCls} pl-9 ${error ? inputErrCls : ""}`}
        />
        {busy && open && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      </div>
      {open && list.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-float dark:border-slate-600 dark:bg-slate-800">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p);
                setOpen(false);
                setQ("");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <UserAvatar name={p.name} userId={p.id} size={24} decorative />
              <span className="flex-1 truncate text-slate-700 dark:text-slate-100">{p.name}</span>
              {p.regNumber && <span className="text-[10px] font-mono text-slate-500">{p.regNumber}</span>}
            </button>
          ))}
        </div>
      )}
      <FieldError message={error} />
    </div>
  );
};

/**
 * Asked when a move needs words: completing (outcome, with nudges for a link and a
 * screenshot) or reopening a completed project (reason). Resolves the payload or null.
 */
export const MoveDialog: React.FC<{
  open: { to: Status; from: Status; title: string; hasLink: boolean; hasImage: boolean; correction?: boolean } | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (payload: { outcomeSummary?: string; reason?: string }) => void;
}> = ({ open, busy, error, onCancel, onConfirm }) => {
  const dark = useIsDark();
  const [text, setText] = useState("");
  useEffect(() => setText(""), [open?.to, open?.title]);
  if (!open) return null;
  const completing = open.to === "COMPLETED" && !open.correction;
  const min = completing ? 20 : 5;
  const M = STATUS_META[open.to];
  const ok = text.trim().length >= min;
  return (
    <Modal isOpen onClose={onCancel} title={<span className="flex items-center gap-2"><M.icon className="h-5 w-5" style={{ color: statusColor(open.to, dark) }} />{completing ? "Complete project" : open.correction ? "Correct status" : "Reopen project"}</span>} size="md">
      <div className="space-y-4">
        {completing && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-sky-50 p-3 dark:from-emerald-500/10 dark:to-sky-500/10">
            <PartyPopper className="h-8 w-8 text-emerald-600" aria-hidden />
            <div className="flex flex-1 gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${open.hasLink ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100" : "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100"}`}>
                {open.hasLink ? <Check className="h-3 w-3" /> : <Github className="h-3 w-3" />} Link
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${open.hasImage ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100" : "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100"}`}>
                {open.hasImage ? <Check className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />} Screenshot
              </span>
            </div>
          </motion.div>
        )}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="move-text" className={labelCls}>{completing ? "What did it achieve?" : "Why?"}</label>
            <CharMeter value={text} min={min} max={completing ? 3000 : 500} />
          </div>
          <textarea id="move-text" autoFocus rows={completing ? 4 : 2} value={text} onChange={(e) => setText(e.target.value)} className={`${inputCls} ${error ? inputErrCls : ""}`} />
          <FieldError message={error} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onCancel}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} disabled={!ok || busy} onClick={() => onConfirm(completing ? { outcomeSummary: text.trim() } : { reason: text.trim() })}>
            {busy ? <Spinner className="h-4 w-4" /> : <M.icon className="h-4 w-4" />}
            {M.label}
          </button>
        </div>
      </div>
    </Modal>
  );
};
