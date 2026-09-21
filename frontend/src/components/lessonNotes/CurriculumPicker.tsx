import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Check, ChevronDown, Clock, FileText, Minus, Search, X } from "lucide-react";
import { SubjectCompetency } from "../../api/curriculum";

interface Props {
  outcomes: SubjectCompetency[];
  loading?: boolean;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Criteria that already have a lesson note -- shown, still selectable, but flagged. */
  coveredIds?: Set<number>;
  /** Optional accent for the picker's selected state (matches the creation mode). */
  accent?: "blue" | "violet" | "rose";
}

const ACCENTS = {
  blue: {
    box: "bg-blue-600 border-blue-600 text-white",
    ring: "border-blue-300 dark:border-blue-700/60 bg-blue-50/50 dark:bg-blue-900/10",
    text: "text-blue-700 dark:text-blue-300",
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  violet: {
    box: "bg-violet-600 border-violet-600 text-white",
    ring: "border-violet-300 dark:border-violet-700/60 bg-violet-50/50 dark:bg-violet-900/10",
    text: "text-violet-700 dark:text-violet-300",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  rose: {
    box: "bg-rose-600 border-rose-600 text-white",
    ring: "border-rose-300 dark:border-rose-700/60 bg-rose-50/50 dark:bg-rose-900/10",
    text: "text-rose-700 dark:text-rose-300",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
};

/** A three-state checkbox: none / some / all of an outcome's criteria. */
const TriCheckbox: React.FC<{
  state: "none" | "some" | "all";
  accent: keyof typeof ACCENTS;
  onToggle: () => void;
  label: string;
}> = ({ state, accent, onToggle, label }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
    aria-label={label}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
      state === "none"
        ? "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-gray-400"
        : ACCENTS[accent].box
    }`}
  >
    {state === "all" && <Check className="w-3 h-3" strokeWidth={3} />}
    {state === "some" && <Minus className="w-3 h-3" strokeWidth={3} />}
  </button>
);

/**
 * Curriculum tree picker: Learning Outcomes as collapsible rows, each with a tri-state
 * checkbox that selects every performance criterion under it, and per-criterion checkboxes
 * inside. A selection can therefore be a whole outcome, part of one, or criteria across
 * several outcomes -- the note stores the criteria, never the outcome.
 */
const CurriculumPicker: React.FC<Props> = ({
  outcomes,
  loading,
  selectedIds,
  onChange,
  coveredIds,
  accent = "blue",
}) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const a = ACCENTS[accent];
  const searchRef = useRef<HTMLInputElement>(null);

  // A fresh subject: open the first outcome so the tree reads as a tree, not a list of
  // closed drawers. Anything already selected stays visible.
  useEffect(() => {
    if (outcomes.length === 0) return;
    setOpen((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<number>([outcomes[0].competency_id]);
      outcomes.forEach((o) => {
        if (o.criteria.some((c) => selected.has(c.criteria_id))) next.add(o.competency_id);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomes]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      !q
        ? outcomes
        : outcomes
            .map((o) => {
              const outcomeHit = o.title.toLowerCase().includes(q) || String(o.element_number) === q;
              const criteria = outcomeHit
                ? o.criteria
                : o.criteria.filter(
                    (c) => c.description.toLowerCase().includes(q) || c.criteria_number.toLowerCase().includes(q),
                  );
              return { ...o, criteria };
            })
            .filter((o) => o.criteria.length > 0),
    [outcomes, q],
  );

  const totalCriteria = outcomes.reduce((n, o) => n + o.criteria.length, 0);
  const selectedOutcomeCount = outcomes.filter((o) => o.criteria.some((c) => selected.has(c.criteria_id))).length;

  const setMany = (ids: number[], on: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange([...next]);
  };

  const outcomeState = (o: SubjectCompetency): "none" | "some" | "all" => {
    const n = o.criteria.filter((c) => selected.has(c.criteria_id)).length;
    return n === 0 ? "none" : n === o.criteria.length ? "all" : "some";
  };

  const toggleOpen = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 divide-y divide-gray-100 dark:divide-gray-700/40 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
            <div className="w-[18px] h-[18px] rounded-md bg-gray-200 dark:bg-gray-700" />
            <div className="w-7 h-5 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3.5 rounded bg-gray-200 dark:bg-gray-700 flex-1 max-w-[60%]" />
          </div>
        ))}
      </div>
    );
  }

  if (outcomes.length === 0) {
    return (
      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700/60 text-xs text-gray-500 dark:text-gray-400">
        <BookOpen className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <span>
          This subject has no curriculum entered yet. You can still create the note; add Learning Outcomes and
          performance criteria under the subject's Curriculum tab to link notes to them.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden bg-white dark:bg-gray-900/40">
      {/* Header: search + running summary + bulk actions */}
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 border-b border-gray-100 dark:border-gray-700/40 bg-gray-50/70 dark:bg-gray-800/40">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search outcomes or criteria..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
          {selected.size === 0 ? (
            `${outcomes.length} outcome${outcomes.length === 1 ? "" : "s"} · ${totalCriteria} criteria`
          ) : (
            <span className={`font-medium ${a.text}`}>
              {selected.size} of {totalCriteria} criteria · {selectedOutcomeCount} outcome{selectedOutcomeCount === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMany(outcomes.flatMap((o) => o.criteria.map((c) => c.criteria_id)), true)}
            disabled={selected.size === totalCriteria}
            className="px-2 py-1 text-[11px] font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/60 disabled:opacity-40"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={selected.size === 0}
            className="px-2 py-1 text-[11px] font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/60 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/40">
        {visible.length === 0 && (
          <p className="px-3.5 py-4 text-xs text-gray-400 text-center">Nothing matches "{query}".</p>
        )}
        {visible.map((o) => {
          const full = outcomes.find((x) => x.competency_id === o.competency_id) || o;
          const state = outcomeState(full);
          const isOpen = open.has(o.competency_id) || !!q;
          const picked = full.criteria.filter((c) => selected.has(c.criteria_id)).length;
          const covered = full.criteria.filter((c) => coveredIds?.has(c.criteria_id)).length;
          return (
            <div key={o.competency_id} className={state !== "none" ? a.ring : ""}>
              {/* Outcome row */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleOpen(o.competency_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleOpen(o.competency_id);
                  }
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/40"
              >
                <TriCheckbox
                  state={state}
                  accent={accent}
                  label={`Select all criteria of Learning Outcome ${o.element_number}`}
                  onToggle={() =>
                    setMany(
                      full.criteria.map((c) => c.criteria_id),
                      state !== "all",
                    )
                  }
                />
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex-shrink-0">
                  LO {o.element_number}
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate flex-1 min-w-0">
                  {o.title}
                </span>
                <span className="hidden sm:flex items-center gap-2 text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
                  {o.learning_hours ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {o.learning_hours}h
                    </span>
                  ) : null}
                  {covered > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                      title={`${covered} of ${full.criteria.length} criteria already have a note`}
                    >
                      <FileText className="w-3 h-3" /> {covered}
                    </span>
                  )}
                  <span className={state === "none" ? "" : `font-medium ${a.text}`}>
                    {picked}/{full.criteria.length}
                  </span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </div>

              {/* Criteria */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    {o.criteria.map((c) => {
                      const on = selected.has(c.criteria_id);
                      const has = coveredIds?.has(c.criteria_id);
                      return (
                        <li key={c.criteria_id}>
                          <label className="flex items-start gap-2.5 pl-10 pr-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={on}
                              onChange={() => setMany([c.criteria_id], !on)}
                            />
                            <span
                              aria-hidden
                              className={`mt-0.5 w-[16px] h-[16px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                on ? a.box : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                              }`}
                            >
                              {on && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                            </span>
                            <span className="text-xs leading-snug text-gray-700 dark:text-gray-200 min-w-0">
                              <span className="font-semibold text-gray-500 dark:text-gray-400 mr-1.5">{c.criteria_number}</span>
                              {c.description}
                              {has && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 align-middle">
                                  <FileText className="w-2.5 h-2.5" /> has a note
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Selection summary chips -- what will be attached to the note, at a glance. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2.5 py-2 border-t border-gray-100 dark:border-gray-700/40 bg-gray-50/70 dark:bg-gray-800/40">
          {outcomes
            .filter((o) => outcomeState(o) !== "none")
            .map((o) => {
              const st = outcomeState(o);
              const n = o.criteria.filter((c) => selected.has(c.criteria_id)).length;
              return (
                <span
                  key={o.competency_id}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium pl-2 pr-1 py-0.5 rounded-full ${a.chip}`}
                >
                  LO {o.element_number} · {st === "all" ? "whole outcome" : `${n} of ${o.criteria.length}`}
                  <button
                    type="button"
                    onClick={() => setMany(o.criteria.map((c) => c.criteria_id), false)}
                    className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                    aria-label={`Remove Learning Outcome ${o.element_number} from the selection`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default CurriculumPicker;
