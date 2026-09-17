import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Users as UsersIcon,
  Edit2,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Role } from "../../api/users";
import { StatusBadge, SkeletonRow } from "./shared";

interface RolesTabProps {
  roles: Role[];
  permissionCounts: Record<number, number>;
  loading: boolean;
  togglingRoleId: number | null;
  onEdit: (role: Role) => void;
  onToggleStatus: (role: Role) => void;
  onAssign: (role: Role) => void;
  assigningRoleId: number | null;
}

const RolesTab: React.FC<RolesTabProps> = ({
  roles,
  permissionCounts,
  loading,
  togglingRoleId,
  onEdit,
  onToggleStatus,
  onAssign,
  assigningRoleId,
}) => {
  const [query, setQuery] = useState("");

  const filtered = roles.filter(
    (role) =>
      role.name.toLowerCase().includes(query.toLowerCase()) ||
      (role.description || "").toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roles..."
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

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} delay={i * 0.03} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400 flex flex-col items-center gap-2">
          <UsersIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          <span>{query ? `No roles match "${query}"` : "No roles found"}</span>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((role, index) => (
            <motion.div
              key={role.role_id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className="flex items-center gap-3 p-3 bg-white/90 dark:bg-slate-800/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-slate-700/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <UsersIcon className="w-5 h-5 text-white" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {role.name}
                  </h3>
                  <StatusBadge status={role.status} />
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {role.description || "No description"}
                </p>
              </div>

              <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" />
                {permissionCounts[role.role_id] ?? 0} permissions
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onEdit(role)}
                  aria-label="Edit role"
                  className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onToggleStatus(role)}
                  disabled={togglingRoleId === role.role_id}
                  aria-label={
                    role.status === "ACTIVE" ? "Disable role" : "Enable role"
                  }
                  className={`p-2 rounded-lg transition-colors ${
                    togglingRoleId === role.role_id
                      ? "opacity-50 cursor-not-allowed"
                      : role.status === "ACTIVE"
                        ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {togglingRoleId === role.role_id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mx-auto" />
                  ) : role.status === "ACTIVE" ? (
                    <ToggleRight className="w-5 h-5" />
                  ) : (
                    <ToggleLeft className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={() => onAssign(role)}
                  disabled={assigningRoleId === role.role_id}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium inline-flex items-center gap-0.5 pl-2 pr-1 py-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {assigningRoleId === role.role_id ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                  ) : (
                    <>
                      Permissions
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
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

export default RolesTab;
