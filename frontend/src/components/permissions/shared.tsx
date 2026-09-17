import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Filter, ChevronDown, Search, Check } from "lucide-react";

export const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    ACTIVE:
      "bg-green-100/50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    DISABLED:
      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
        colors[status] || colors.ACTIVE
      }`}
    >
      {status}
    </span>
  );
};

export const SkeletonRow = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay }}
    className="flex items-center gap-3 p-3 bg-white/60 dark:bg-slate-800/40 rounded-2xl border border-white/50 dark:border-slate-700/20 animate-pulse"
  >
    <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-slate-700 shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <div className="h-3.5 w-40 rounded bg-gray-200 dark:bg-slate-700" />
      <div className="h-3 w-56 rounded bg-gray-200 dark:bg-slate-700" />
    </div>
  </motion.div>
);

export const StatCard = ({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
  loading?: boolean;
}) => (
  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-3 border border-white/50 dark:border-slate-700/30 flex items-center gap-2">
    <div
      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accent}`}
    >
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0">
      {loading ? (
        <div className="h-5 w-8 rounded bg-gray-200 dark:bg-slate-700 animate-pulse" />
      ) : (
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
          {value}
        </p>
      )}
      <p className="text-xs text-gray-400 truncate">{label}</p>
    </div>
  </div>
);

export interface CategoryOption {
  value: string;
  label: string;
  count: number;
}

interface CategoryFilterDropdownProps {
  options: CategoryOption[];
  allLabel: string;
  allCount: number;
  selected: string;
  onSelect: (value: string) => void;
}

export const CategoryFilterDropdown: React.FC<CategoryFilterDropdownProps> = ({
  options,
  allLabel,
  allCount,
  selected,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open]);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(query.toLowerCase()),
  );

  const selectedLabel =
    selected === "all"
      ? `${allLabel} (${allCount})`
      : (() => {
          const opt = options.find((o) => o.value === selected);
          return opt ? `${opt.label} (${opt.count})` : allLabel;
        })();

  return (
    <div ref={containerRef} className="relative w-full sm:w-64 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="relative w-full flex items-center pl-10 pr-9 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm text-left focus:outline-none focus:border-blue-500"
      >
        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search categories..."
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 dark:text-white"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={selected === "all"}
              onClick={() => {
                onSelect("all");
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-slate-700/60 ${
                selected === "all"
                  ? "text-blue-600 dark:text-blue-400 font-medium"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              <span>{allLabel}</span>
              <span className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                {allCount}
                {selected === "all" && <Check className="w-3.5 h-3.5" />}
              </span>
            </button>

            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-center text-gray-400">
                No categories match &quot;{query}&quot;
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selected === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-slate-700/60 ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    <span className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                      {opt.count}
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface PermissionNamePickerProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// A required single-select searchable picker, scoped to a fixed list of
// options (the static Permissions enum) rather than free text — used when
// creating a new permission so its name can't drift from what the codebase's
// permission checks actually expect.
export const PermissionNamePicker: React.FC<PermissionNamePickerProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select a permission...",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open]);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-left focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all ${
          value
            ? "text-gray-900 dark:text-white"
            : "text-gray-400 dark:text-gray-500"
        }`}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search permissions..."
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 dark:text-white"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-center text-gray-400">
                {options.length === 0
                  ? "All permissions have already been created"
                  : `No matches for "${query}"`}
              </p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={value === opt}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-slate-700/60 ${
                    value === opt
                      ? "text-blue-600 dark:text-blue-400 font-medium"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {value === opt && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
