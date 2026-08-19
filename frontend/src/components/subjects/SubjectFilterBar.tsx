import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  SlidersHorizontal,
  X,
  Check,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
} from "lucide-react";
import { Facet, SubjectFacets } from "../../api/users";

/**
 * Filter bar for Class Subjects.
 *
 * Every option and its count comes from the same request as the list, so
 * opening a menu costs nothing. Facet counts are computed before the facet
 * filters are applied, which is why an option never disappears as you use it.
 */

export interface SubjectFilterState {
  search: string;
  gradeId: number | "all";
  classGroupIds: number[];
  teacherIds: number[];
  categoryIds: number[];
  status: string;
  assignment: "" | "assigned" | "unassigned";
  sort: string;
}

export const EMPTY_FILTERS: SubjectFilterState = {
  search: "",
  gradeId: "all",
  classGroupIds: [],
  teacherIds: [],
  categoryIds: [],
  status: "",
  assignment: "",
  sort: "name",
};

const SORTS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "code", label: "Code" },
  { value: "teachers", label: "Most teachers" },
  { value: "class-groups", label: "Most class groups" },
];

/** A dropdown of checkboxes — subjects can legitimately match several values. */
const MultiSelect = ({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Facet[];
  selected: (number | string)[];
  onChange: (next: (number | string)[]) => void;
}) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
  }, [open]);

  if (options.length === 0) return null;

  const toggle = (id: number | string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((v) => v !== id)
        : [...selected, id],
    );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
          selected.length > 0
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-200 border-blue-100 dark:border-blue-900/50 hover:border-blue-400"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="text-[11px] font-bold px-1.5 rounded-full bg-white/25">
            {selected.length}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 mt-1 w-60 max-h-72 overflow-y-auto rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-white dark:bg-slate-800 shadow-xl p-1"
          >
            {options.map((opt) => {
              const active = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-left hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                >
                  <span
                    className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
                      active
                        ? "bg-blue-600 border-blue-600"
                        : "border-blue-200 dark:border-blue-800"
                    }`}
                  >
                    {active && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                    {opt.name}
                  </span>
                  <span className="text-[11px] text-blue-400 tabular-nums">
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Segmented = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="inline-flex p-0.5 rounded-xl bg-blue-100/70 dark:bg-blue-950/50">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        aria-pressed={value === opt.value}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          value === opt.value
            ? "bg-blue-600 text-white shadow-sm"
            : "text-blue-700/70 dark:text-blue-300/70 hover:text-blue-800"
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

interface SubjectFilterBarProps {
  filters: SubjectFilterState;
  onChange: (next: Partial<SubjectFilterState>) => void;
  onReset: () => void;
  facets: SubjectFacets;
  grades: { grade_id: number; name: string }[];
  total: number;
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
}

const SubjectFilterBar: React.FC<SubjectFilterBarProps> = ({
  filters,
  onChange,
  onReset,
  facets,
  grades,
  total,
  view,
  onViewChange,
}) => {
  const [showFilters, setShowFilters] = React.useState(false);

  const activeCount =
    filters.classGroupIds.length +
    filters.teacherIds.length +
    filters.categoryIds.length +
    (filters.status ? 1 : 0) +
    (filters.assignment ? 1 : 0) +
    (filters.gradeId !== "all" ? 1 : 0);

  const nameOf = (list: Facet[], id: number | string) =>
    list.find((f) => f.id === id)?.name ?? String(id);

  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...(filters.gradeId !== "all"
      ? [
          {
            key: `grade-${filters.gradeId}`,
            label:
              grades.find((g) => g.grade_id === filters.gradeId)?.name ??
              "Grade",
            onRemove: () => onChange({ gradeId: "all" }),
          },
        ]
      : []),
    ...filters.classGroupIds.map((id) => ({
      key: `cg-${id}`,
      label: nameOf(facets.classGroups, id),
      onRemove: () =>
        onChange({
          classGroupIds: filters.classGroupIds.filter((v) => v !== id),
        }),
    })),
    ...filters.teacherIds.map((id) => ({
      key: `t-${id}`,
      label: nameOf(facets.teachers, id),
      onRemove: () =>
        onChange({ teacherIds: filters.teacherIds.filter((v) => v !== id) }),
    })),
    ...filters.categoryIds.map((id) => ({
      key: `c-${id}`,
      label: nameOf(facets.categories, id),
      onRemove: () =>
        onChange({ categoryIds: filters.categoryIds.filter((v) => v !== id) }),
    })),
    ...(filters.status
      ? [
          {
            key: "status",
            label: filters.status,
            onRemove: () => onChange({ status: "" }),
          },
        ]
      : []),
    ...(filters.assignment
      ? [
          {
            key: "assignment",
            label:
              filters.assignment === "assigned"
                ? "Has a teacher"
                : "No teacher yet",
            onRemove: () => onChange({ assignment: "" }),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      {/* Search + controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search subjects, teachers, class groups..."
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-white dark:bg-slate-800 text-sm dark:text-white placeholder:text-blue-400/70 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-shadow"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ search: "" })}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-sm font-medium border transition-colors ${
              showFilters || activeCount > 0
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-200 border-blue-100 dark:border-blue-900/50 hover:border-blue-400"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeCount > 0 && (
              <span className="text-[11px] font-bold px-1.5 rounded-full bg-white/25">
                {activeCount}
              </span>
            )}
          </button>

          <div className="hidden sm:flex p-0.5 rounded-xl bg-blue-100/70 dark:bg-blue-950/50">
            <button
              type="button"
              onClick={() => onViewChange("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={`p-2 rounded-lg transition-colors ${
                view === "grid"
                  ? "bg-blue-600 text-white"
                  : "text-blue-700/70 dark:text-blue-300/70"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewChange("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={`p-2 rounded-lg transition-colors ${
                view === "list"
                  ? "bg-blue-600 text-white"
                  : "text-blue-700/70 dark:text-blue-300/70"
              }`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter drawer */}
      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-visible"
          >
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-white/80 dark:bg-slate-800/60">
              {grades.length > 1 && (
                <select
                  value={filters.gradeId}
                  onChange={(e) =>
                    onChange({
                      gradeId:
                        e.target.value === "all"
                          ? "all"
                          : Number(e.target.value),
                    })
                  }
                  aria-label="Grade"
                  className="px-3 py-2 rounded-xl text-sm font-medium border border-blue-100 dark:border-blue-900/50 bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All my grades</option>
                  {grades.map((g) => (
                    <option key={g.grade_id} value={g.grade_id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}

              <MultiSelect
                label="Class group"
                options={facets.classGroups}
                selected={filters.classGroupIds}
                onChange={(next) =>
                  onChange({ classGroupIds: next as number[] })
                }
              />
              <MultiSelect
                label="Teacher"
                options={facets.teachers}
                selected={filters.teacherIds}
                onChange={(next) => onChange({ teacherIds: next as number[] })}
              />
              <MultiSelect
                label="Category"
                options={facets.categories}
                selected={filters.categoryIds}
                onChange={(next) => onChange({ categoryIds: next as number[] })}
              />

              <Segmented
                value={filters.status}
                onChange={(status) => onChange({ status })}
                options={[
                  { value: "", label: "Any status" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "DISABLED", label: "Disabled" },
                ]}
              />

              <Segmented
                value={filters.assignment}
                onChange={(assignment) => onChange({ assignment })}
                options={[
                  { value: "", label: "All" },
                  { value: "assigned", label: "Staffed" },
                  {
                    value: "unassigned",
                    label: `Unstaffed${
                      facets.unassigned ? ` (${facets.unassigned})` : ""
                    }`,
                  },
                ]}
              />

              <div className="flex items-center gap-1.5 ml-auto">
                <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
                <select
                  value={filters.sort}
                  onChange={(e) => onChange({ sort: e.target.value })}
                  aria-label="Sort by"
                  className="px-3 py-2 rounded-xl text-sm font-medium border border-blue-100 dark:border-blue-900/50 bg-white dark:bg-slate-800 text-blue-800 dark:text-blue-200 focus:outline-none focus:border-blue-500"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active filters + result count */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-blue-900/60 dark:text-blue-100/50">
          <strong className="text-blue-900 dark:text-blue-50 tabular-nums">
            {total}
          </strong>{" "}
          subject{total === 1 ? "" : "s"}
        </span>

        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50"
          >
            {chip.label}
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={`Remove filter ${chip.label}`}
              className="p-0.5 rounded-full hover:bg-blue-200/70 dark:hover:bg-blue-800"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {(activeCount > 0 || filters.search) && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
};

export default SubjectFilterBar;
