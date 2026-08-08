import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Key,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Search,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { Permission } from "../../api/users";
import { StatusBadge, SkeletonRow, CategoryFilterDropdown } from "./shared";
import { getPermissionCategory } from "../../utils/permissionCategory";

interface PermissionsListTabProps {
  permissions: Permission[];
  roleUsageCounts: Record<number, number>;
  loading: boolean;
  togglingPermId: number | null;
  onEdit: (permission: Permission) => void;
  onToggleStatus: (permission: Permission) => void;
}

const PermissionsListTab: React.FC<PermissionsListTabProps> = ({
  permissions,
  roleUsageCounts,
  loading,
  togglingPermId,
  onEdit,
  onToggleStatus,
}) => {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    permissions.forEach((perm) => {
      const cat = getPermissionCategory(perm.name);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count);
  }, [permissions]);

  const filtered = permissions.filter((perm) => {
    const matchesQuery =
      perm.name.toLowerCase().includes(query.toLowerCase()) ||
      (perm.description || "").toLowerCase().includes(query.toLowerCase());
    const matchesCategory =
      activeCategory === "all" ||
      getPermissionCategory(perm.name) === activeCategory;
    return matchesQuery && matchesCategory;
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search permissions..."
            className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <CategoryFilterDropdown
          options={categoryOptions}
          allLabel="All categories"
          allCount={permissions.length}
          selected={activeCategory}
          onSelect={setActiveCategory}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} delay={i * 0.03} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400 flex flex-col items-center gap-2">
          <Key className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          <span>
            {query
              ? `No permissions match "${query}"`
              : activeCategory !== "all"
                ? `No permissions in "${activeCategory}"`
                : "No permissions found"}
          </span>
          {(query || activeCategory !== "all") && (
            <button
              onClick={() => {
                setQuery("");
                setActiveCategory("all");
              }}
              className="mt-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((perm, index) => (
            <motion.div
              key={perm.perm_id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className="flex items-center gap-3 p-3 bg-white/90 dark:bg-slate-800/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-slate-700/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shrink-0">
                <Key className="w-5 h-5 text-white" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {perm.name}
                  </h3>
                  <StatusBadge status={perm.status} />
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {perm.description || "No description"}
                </p>
              </div>

              <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                <UsersIcon className="w-3.5 h-3.5" />
                {roleUsageCounts[perm.perm_id] ?? 0} roles
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onEdit(perm)}
                  aria-label="Edit permission"
                  className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onToggleStatus(perm)}
                  disabled={togglingPermId === perm.perm_id}
                  aria-label={
                    perm.status === "ACTIVE"
                      ? "Disable permission"
                      : "Enable permission"
                  }
                  className={`p-2 rounded-lg transition-colors ${
                    togglingPermId === perm.perm_id
                      ? "opacity-50 cursor-not-allowed"
                      : perm.status === "ACTIVE"
                        ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {togglingPermId === perm.perm_id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mx-auto" />
                  ) : perm.status === "ACTIVE" ? (
                    <ToggleRight className="w-5 h-5" />
                  ) : (
                    <ToggleLeft className="w-5 h-5" />
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PermissionsListTab;
