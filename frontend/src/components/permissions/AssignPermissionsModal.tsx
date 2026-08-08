import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Check,
  X,
  Shield,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Permission, Role } from "../../api/users";
import { StatusBadge } from "./shared";
import { getPermissionCategory } from "../../utils/permissionCategory";

interface AssignPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: Role | null;
  permissions: Permission[];
  initialSelected: number[];
  saving: boolean;
  loadingCurrent: boolean;
  onSave: (permissionIds: number[]) => void;
}

const AssignPermissionsModal: React.FC<AssignPermissionsModalProps> = ({
  isOpen,
  onClose,
  role,
  permissions,
  initialSelected,
  saving,
  loadingCurrent,
  onSave,
}) => {
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelected(initialSelected);
      setQuery("");
      setActiveCategory("all");
      setCollapsed({});
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen, initialSelected]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const categories = useMemo(
    () => Array.from(new Set(permissions.map((p) => getPermissionCategory(p.name)))),
    [permissions],
  );

  const filtered = useMemo(() => {
    return permissions.filter((p) => {
      const matchesQuery =
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.description || "").toLowerCase().includes(query.toLowerCase());
      const matchesCategory =
        activeCategory === "all" || getPermissionCategory(p.name) === activeCategory;
      return matchesQuery && matchesCategory;
    });
  }, [permissions, query, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    filtered.forEach((p) => {
      const cat = getPermissionCategory(p.name);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const categoryBreakdown = useMemo(
    () =>
      categories
        .map((cat) => {
          const permsInCat = permissions.filter(
            (p) => getPermissionCategory(p.name) === cat,
          );
          return {
            cat,
            total: permsInCat.length,
            selected: permsInCat.filter((p) => selected.includes(p.perm_id))
              .length,
          };
        })
        .sort((a, b) => b.total - a.total),
    [categories, permissions, selected],
  );

  const toggle = (permId: number) => {
    setSelected((prev) =>
      prev.includes(permId)
        ? prev.filter((id) => id !== permId)
        : [...prev, permId],
    );
  };

  const toggleCategoryGroup = (perms: Permission[]) => {
    const ids = perms.map((p) => p.perm_id);
    const allSelected = ids.every((id) => selected.includes(id));
    setSelected((prev) =>
      allSelected
        ? prev.filter((id) => !ids.includes(id))
        : Array.from(new Set([...prev, ...ids])),
    );
  };

  const selectFiltered = () => {
    setSelected((prev) =>
      Array.from(new Set([...prev, ...filtered.map((p) => p.perm_id)])),
    );
  };

  const clearFiltered = () => {
    const ids = new Set(filtered.map((p) => p.perm_id));
    setSelected((prev) => prev.filter((id) => !ids.has(id)));
  };

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const totalCount = permissions.length;
  const selectedCount = selected.length;
  const pct = totalCount > 0 ? Math.round((selectedCount / totalCount) * 100) : 0;
  const hasFilter = query !== "" || activeCategory !== "all";

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 w-full h-full sm:h-[90vh] sm:max-w-6xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700/60 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                    Assign Permissions
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {role?.name}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body: two columns (stacked on mobile) */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              {/* Left: role details & summary */}
              <div className="lg:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-slate-700/60 p-5 overflow-y-auto bg-gray-50/50 dark:bg-slate-950/40 max-h-56 lg:max-h-none">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {role?.name}
                  </h3>
                  {role && <StatusBadge status={role.status} />}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {role?.description || "No description"}
                </p>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/50 mb-4">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-gray-500 dark:text-gray-400">
                      Assigned
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {selectedCount} / {totalCount}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs font-medium text-gray-400 uppercase mb-2">
                  By category
                </p>
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveCategory("all")}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      activeCategory === "all"
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                        : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    <span>All categories</span>
                    <span className="shrink-0 ml-2 text-gray-400">
                      {selectedCount}/{totalCount}
                    </span>
                  </button>
                  {categoryBreakdown.map(({ cat, total, selected: sel }) => (
                    <button
                      key={cat}
                      onClick={() =>
                        setActiveCategory(activeCategory === cat ? "all" : cat)
                      }
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        activeCategory === cat
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                          : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      <span className="truncate">{cat}</span>
                      <span className="shrink-0 ml-2 text-gray-400">
                        {sel}/{total}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: permission selection */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700/60 space-y-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search permissions..."
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:border-blue-500 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {filtered.length} of {totalCount} shown
                      {activeCategory !== "all" && ` · ${activeCategory}`}
                    </span>
                    <div className="flex gap-3 text-xs">
                      <button
                        onClick={selectFiltered}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        Select {hasFilter ? "shown" : "all"}
                      </button>
                      <button
                        onClick={clearFiltered}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        Clear {hasFilter ? "shown" : "all"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingCurrent ? (
                    <div className="flex justify-center py-16">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : grouped.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-16">
                      No permissions match your filters
                    </p>
                  ) : (
                    grouped.map(([cat, perms]) => {
                      const allSelected = perms.every((p) =>
                        selected.includes(p.perm_id),
                      );
                      const someSelected = perms.some((p) =>
                        selected.includes(p.perm_id),
                      );
                      const isCollapsed = collapsed[cat];
                      return (
                        <div
                          key={cat}
                          className="border border-gray-100 dark:border-slate-800 rounded-xl overflow-hidden"
                        >
                          <div className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-800/60">
                            <button
                              onClick={() => toggleCollapse(cat)}
                              className="flex items-center gap-2 flex-1 min-w-0"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
                                {cat}
                              </span>
                              <span className="text-xs text-gray-400 shrink-0">
                                (
                                {
                                  perms.filter((p) =>
                                    selected.includes(p.perm_id),
                                  ).length
                                }
                                /{perms.length})
                              </span>
                            </button>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected && !allSelected;
                              }}
                              onChange={() => toggleCategoryGroup(perms)}
                              className="w-4 h-4 text-blue-500 rounded focus:ring-blue-500 shrink-0"
                            />
                          </div>
                          {!isCollapsed && (
                            <div className="divide-y divide-gray-100 dark:divide-slate-800">
                              {perms.map((perm) => {
                                const isChecked = selected.includes(
                                  perm.perm_id,
                                );
                                return (
                                  <label
                                    key={perm.perm_id}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                                      isChecked
                                        ? "bg-blue-50/70 dark:bg-blue-900/10"
                                        : "hover:bg-gray-50 dark:hover:bg-slate-800/40"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggle(perm.perm_id)}
                                      className="w-4 h-4 text-blue-500 rounded focus:ring-blue-500 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {perm.name}
                                      </p>
                                      {perm.description && (
                                        <p className="text-xs text-gray-400 truncate">
                                          {perm.description}
                                        </p>
                                      )}
                                    </div>
                                    {isChecked && (
                                      <Check className="w-4 h-4 text-blue-500 shrink-0" />
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-200 dark:border-slate-700/60 shrink-0">
              <span className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">
                {selectedCount} of {totalCount} permissions selected
              </span>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-5 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onSave(selected)}
                  disabled={saving || loadingCurrent}
                  className="flex-1 sm:flex-none px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save changes
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default AssignPermissionsModal;
