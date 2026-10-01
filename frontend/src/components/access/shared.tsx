import React, { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import Modal from "../ui/Modal";
import type { Nodes } from "../../api/access";
import { searchUsers, UserSearchResult } from "../../api/users";
import type { Depth, ScopeType } from "../../vendor/nga-access";

/** "Programme: Primary", "Class: G7-A", "Maths in G9-B", "Whole school"... */
export function nodeLabel(
  scopeType: ScopeType,
  scopeId: number | null | undefined,
  scopeId2: number | null | undefined,
  nodes: Nodes | null,
): string {
  const find = <T extends { id: number }>(list: T[] | undefined, id?: number | null) =>
    list?.find((x) => x.id === id);
  switch (scopeType) {
    case "PLATFORM":
      return "Whole platform";
    case "SCHOOL":
      return "Whole school";
    case "PROGRAM":
      return `Programme: ${find(nodes?.programs, scopeId)?.name ?? `#${scopeId}`}`;
    case "DEPARTMENT":
      return `Department: ${find(nodes?.departments, scopeId)?.name ?? `#${scopeId}`}`;
    case "GRADE":
      return `Grade: ${find(nodes?.grades, scopeId)?.name ?? `#${scopeId}`}`;
    case "CLASS_GROUP":
      return `Class: ${find(nodes?.classGroups, scopeId)?.name ?? `#${scopeId}`}`;
    case "SUBJECT_CLASS":
      return `${find(nodes?.subjects, scopeId)?.name ?? `Subject #${scopeId}`} in ${
        find(nodes?.classGroups, scopeId2)?.name ?? `class #${scopeId2}`
      }`;
    case "MENTEES":
      return "Their mentees";
    case "CHILDREN":
      return "Their children";
    case "SELF":
      return "Own records";
    default:
      return scopeType;
  }
}

export const SCOPE_LABELS: Record<ScopeType, string> = {
  PLATFORM: "Platform",
  SCHOOL: "Whole school",
  PROGRAM: "Programme",
  DEPARTMENT: "Department",
  GRADE: "Grade",
  CLASS_GROUP: "Class",
  SUBJECT_CLASS: "Subject in a class",
  MENTEES: "Mentees",
  CHILDREN: "Children",
  SELF: "Own records",
};

export const DEPTH_INFO: Record<Depth, { label: string; hint: string; cls: string }> = {
  summary: {
    label: "Summary",
    hint: "Aggregates only (programme/grade/class dashboards) -- no names, no individual records",
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  detail: {
    label: "Detail",
    hint: "Individual records within the scope",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  sensitive: {
    label: "Sensitive",
    hint: "Restricted fields (case notes, safeguarding) -- needs a justification and an end date",
    cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
};

export const DepthPill: React.FC<{ depth: Depth | null }> = ({ depth }) =>
  depth ? (
    <span title={DEPTH_INFO[depth].hint} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${DEPTH_INFO[depth].cls}`}>
      {DEPTH_INFO[depth].label}
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      Can do
    </span>
  );

export const Panel: React.FC<{ title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  actions,
  children,
  className = "",
}) => (
  <section
    className={`bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-white/60 dark:border-slate-700/30 p-4 text-text-primary-light dark:text-text-primary-dark ${className}`}
  >
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        {title && <h2 className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">{title}</h2>}
        {actions}
      </div>
    )}
    {children}
  </section>
);

/** Secondary text that passes WCAG AA contrast in both themes. */
export const mutedCls = "text-slate-600 dark:text-slate-300";

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-slate-600 dark:text-slate-300 py-6 text-center">{children}</p>
);

export const inputCls =
  "w-full rounded-lg border border-border-light dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-text-primary-light dark:text-text-primary-dark focus:outline-none focus:ring-2 focus:ring-brand-500/40";
export const btnCls =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnPrimary = `${btnCls} bg-brand-600 text-white hover:bg-brand-700`;
export const btnGhost = `${btnCls} border border-border-light dark:border-slate-700 text-text-primary-light dark:text-text-primary-dark hover:bg-surface-light dark:hover:bg-slate-800`;
export const btnDanger = `${btnCls} border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30`;

export const fullName = (u: Pick<UserSearchResult, "first_name" | "last_name" | "username">) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;

/** Debounced person search over GET /users/search. */
export const UserPicker: React.FC<{
  value: UserSearchResult | null;
  onChange: (u: UserSearchResult | null) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = "Search people by name, username or email" }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const timer = useRef<number>();

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      searchUsers(q.trim())
        .then((r) => setResults(r.slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border-light dark:border-slate-700 px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{fullName(value)}</span>{" "}
          <span className="text-slate-600 dark:text-slate-300">
            {value.user_type ? `· ${value.user_type.toLowerCase()}` : ""} · #{value.user_id}
          </span>
        </span>
        <button type="button" aria-label="Clear person" onClick={() => onChange(null)}>
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-600 dark:text-slate-300" />
      <input aria-label="Search people" className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-border-light dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-64 overflow-auto">
          {results.map((u) => (
            <li key={u.user_id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-light dark:hover:bg-slate-800"
                onClick={() => {
                  onChange(u);
                  setQ("");
                  setResults([]);
                }}
              >
                <span className="font-medium">{fullName(u)}</span>{" "}
                <span className="text-slate-600 dark:text-slate-300">
                  {u.user_type?.toLowerCase()} · {u.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Pick a node of the hierarchy for a scope type. */
export const NodePicker: React.FC<{
  scopeType: ScopeType;
  nodes: Nodes | null;
  scopeId: number | null;
  scopeId2: number | null;
  onChange: (scopeId: number | null, scopeId2: number | null) => void;
}> = ({ scopeType, nodes, scopeId, scopeId2, onChange }) => {
  const opt = (list: Array<{ id: number; name: string }> | undefined, value: number | null, set: (v: number | null) => void, label: string) => (
    <select className={inputCls} value={value ?? ""} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)} aria-label={label}>
      <option value="">{label}</option>
      {(list ?? []).map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
  switch (scopeType) {
    case "PROGRAM":
      return opt(nodes?.programs, scopeId, (v) => onChange(v, null), "Choose a programme");
    case "DEPARTMENT":
      return opt(nodes?.departments, scopeId, (v) => onChange(v, null), "Choose a department");
    case "GRADE":
      return opt(nodes?.grades, scopeId, (v) => onChange(v, null), "Choose a grade");
    case "CLASS_GROUP":
      return opt(nodes?.classGroups, scopeId, (v) => onChange(v, null), "Choose a class");
    case "SUBJECT_CLASS":
      return (
        <div className="grid grid-cols-2 gap-2">
          {opt(nodes?.subjects, scopeId, (v) => onChange(v, scopeId2), "Choose a subject")}
          {opt(nodes?.classGroups, scopeId2, (v) => onChange(scopeId, v), "Choose a class")}
        </div>
      );
    default:
      return null;
  }
};

/**
 * Confirmation for consequential actions (end / suspend a position): a real,
 * themed, accessible dialog with an explained consequence and a required
 * reason -- never window.prompt.
 */
export const ConfirmReasonDialog: React.FC<{
  open: boolean;
  title: string;
  consequence: string;
  confirmLabel: string;
  danger?: boolean;
  minReason?: number;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}> = ({ open, title, consequence, confirmLabel, danger = false, minReason = 3, onCancel, onConfirm }) => {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
      setBusy(false);
    }
  }, [open]);
  const tooShort = reason.trim().length < minReason;
  return (
    <Modal isOpen={open} onClose={() => !busy && onCancel()} title={title} size="md">
      <form
        className="space-y-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setTouched(true);
          if (tooShort) return;
          setBusy(true);
          try {
            await onConfirm(reason.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-text-primary-light dark:text-text-primary-dark">{consequence}</p>
        <label className="block">
          <span className="font-medium text-text-primary-light dark:text-text-primary-dark">Reason (recorded in the audit log)</span>
          <textarea
            className={inputCls}
            rows={3}
            value={reason}
            aria-invalid={touched && tooShort}
            aria-describedby="confirm-reason-help"
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          <span id="confirm-reason-help" className={`text-xs ${touched && tooShort ? "text-rose-700 dark:text-rose-300" : mutedCls}`}>
            {touched && tooShort ? `Please give a reason (at least ${minReason} characters).` : "Visible to administrators reviewing access."}
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={danger ? `${btnCls} bg-rose-600 text-white hover:bg-rose-700` : btnPrimary} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};
