import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import {
  Users as UsersIcon,
  User as UserIcon,
  ShieldCheck,
  GraduationCap,
  Search,
  CheckCircle,
  XCircle,
  Plus,
  FileSpreadsheet,
  Download,
  Loader2,
  X,
  Filter,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  getUsersWithPagination,
  UserWithProfile,
  enableUser,
  disableUser,
  getUser,
  User,
  Role,
} from "../api/users";
import {
  fetchUserBreakdown,
  invalidateUserBreakdownCache,
} from "../utils/userRoleCounts";
import UserProfileModal from "./UserProfileModal";
import ExcelUploadModal from "./ExcelUploadModal";
import { CreateUserModal } from "./CreateUserModal";
import UserItemCard from "./UserItemCard";
import { useToast } from "../contexts/ToastContext";

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 20;

interface Stats {
  total: number;
  admins: number;
  students: number;
  active: number;
  disabled: number;
}

const EMPTY_STATS: Stats = {
  total: 0,
  admins: 0,
  students: 0,
  active: 0,
  disabled: 0,
};

const StatCard = ({
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
  <motion.div
    whileHover={{ y: -2 }}
    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-3 border border-white/50 dark:border-slate-700/30"
  >
    <div className="flex items-center gap-2">
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
  </motion.div>
);

const SkeletonRow = ({ delay }: { delay: number }) => (
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

interface RoleFilterDropdownProps {
  roles: Role[];
  selectedRole: string;
  roleTotals: Record<string, number>;
  allRoleTotal: number;
  statsLoading: boolean;
  loading: boolean;
  onSelect: (roleId: string) => void;
}

const RoleFilterDropdown: React.FC<RoleFilterDropdownProps> = ({
  roles,
  selectedRole,
  roleTotals,
  allRoleTotal,
  statsLoading,
  loading,
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

  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(query.toLowerCase()),
  );

  const selectedRoleObj = roles.find(
    (role) => role.role_id.toString() === selectedRole,
  );
  const selectedLabel =
    selectedRole === "all"
      ? `All roles${statsLoading ? "" : ` (${allRoleTotal})`}`
      : selectedRoleObj
        ? `${selectedRoleObj.name}${
            statsLoading
              ? ""
              : ` (${roleTotals[selectedRoleObj.role_id.toString()] ?? 0})`
          }`
        : "All roles";

  return (
    <div ref={containerRef} className="relative w-full sm:w-64 shrink-0">
      <button
        type="button"
        disabled={loading}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="relative w-full flex items-center pl-10 pr-9 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm text-left focus:outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
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
                placeholder="Search roles..."
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 dark:text-white"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={selectedRole === "all"}
              onClick={() => {
                onSelect("all");
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-slate-700/60 ${
                selectedRole === "all"
                  ? "text-blue-600 dark:text-blue-400 font-medium"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              <span>All roles</span>
              <span className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                {statsLoading ? "" : allRoleTotal}
                {selectedRole === "all" && <Check className="w-3.5 h-3.5" />}
              </span>
            </button>

            {filteredRoles.length === 0 ? (
              <p className="px-3 py-4 text-xs text-center text-gray-400">
                No roles match "{query}"
              </p>
            ) : (
              filteredRoles.map((role) => {
                const roleId = role.role_id.toString();
                const isSelected = selectedRole === roleId;
                return (
                  <button
                    key={role.role_id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(roleId);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-slate-700/60 ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    <span className="truncate">{role.name}</span>
                    <span className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                      {statsLoading ? "" : (roleTotals[roleId] ?? 0)}
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

interface UsersManagementProps {
  roles: Role[];
  initialRoleFilter?: string | null;
  onInitialRoleFilterApplied?: () => void;
}

const UsersManagement: React.FC<UsersManagementProps> = ({
  roles,
  initialRoleFilter,
  onInitialRoleFilterApplied,
}) => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithProfile | null>(
    null,
  );
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");
  const [expandedUsers, setExpandedUsers] = useState<number[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [roleTotals, setRoleTotals] = useState<Record<string, number>>({});
  const [allRoleTotal, setAllRoleTotal] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);
  const [isSwitchingUser, setIsSwitchingUser] = useState(false);

  const requestSeqRef = useRef(0);
  const pageRef = useRef(1);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const breakdownInitRef = useRef(false);
  const inFlightRef = useRef<{ key: string; promise: Promise<void> } | null>(
    null,
  );

  // Debounce free-text search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Apply a role filter requested from the Dashboard tab
  useEffect(() => {
    if (initialRoleFilter) {
      setSelectedRole(initialRoleFilter);
      onInitialRoleFilterApplied?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoleFilter]);

  const refreshBreakdown = useCallback(
    async (force = false) => {
      if (roles.length === 0) return;
      setStatsLoading(true);
      try {
        const breakdown = await fetchUserBreakdown(roles, force);
        const admins = breakdown.roleCounts.find((rc) =>
          rc.role.name.toUpperCase().includes("ADMIN"),
        );
        const students = breakdown.roleCounts.find(
          (rc) => rc.role.name.toUpperCase() === "STUDENT",
        );
        setStats({
          total: breakdown.overallTotal,
          admins: admins?.total ?? 0,
          students: students?.total ?? 0,
          active: breakdown.overallActive,
          disabled: breakdown.overallDisabled,
        });
        setRoleTotals(
          Object.fromEntries(
            breakdown.roleCounts.map((rc) => [
              rc.role.role_id.toString(),
              rc.total,
            ]),
          ),
        );
        setAllRoleTotal(breakdown.overallTotal);
      } catch (error) {
        console.error("Failed to load stats:", error);
      } finally {
        setStatsLoading(false);
      }
    },
    [roles],
  );

  // Fetch once per mount (guarded against StrictMode's dev-only double
  // effect invocation); roles arrives async from the shell so wait for it.
  useEffect(() => {
    if (roles.length === 0 || breakdownInitRef.current) return;
    breakdownInitRef.current = true;
    refreshBreakdown();
  }, [roles, refreshBreakdown]);

  const fetchPage = useCallback(
    (pageNum: number, replace: boolean): Promise<void> => {
      const key = `${pageNum}|${selectedRole}|${selectedStatus}|${debouncedSearch}`;
      // Dedupe identical concurrent requests (StrictMode double-invoke,
      // or the scroll sentinel firing more than once for the same page).
      if (inFlightRef.current?.key === key) {
        return inFlightRef.current.promise;
      }
      const seq = ++requestSeqRef.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      const promise = (async () => {
        try {
          const result = await getUsersWithPagination(
            pageNum,
            PAGE_SIZE,
            selectedRole === "all" ? undefined : selectedRole,
            debouncedSearch || undefined,
            selectedStatus === "all" ? undefined : selectedStatus,
          );
          if (seq !== requestSeqRef.current) return;
          if (result) {
            setUsers((prev) =>
              replace ? result.users : [...prev, ...result.users],
            );
            setTotal(result.total);
            setHasMore(pageNum < result.totalPages);
            pageRef.current = pageNum;
          }
        } catch (error) {
          if (seq !== requestSeqRef.current) return;
          console.error("Failed to load users:", error);
          showToast("Failed to load users", "error");
        } finally {
          if (seq === requestSeqRef.current) {
            setLoading(false);
            setLoadingMore(false);
          }
          if (inFlightRef.current?.key === key) inFlightRef.current = null;
        }
      })();
      inFlightRef.current = { key, promise };
      return promise;
    },
    [selectedRole, selectedStatus, debouncedSearch, showToast],
  );

  // Filters changed: reset to page 1 and replace the list
  useEffect(() => {
    pageRef.current = 1;
    setHasMore(true);
    fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, selectedStatus, debouncedSearch]);

  // Infinite scroll: observe the sentinel at the bottom of the list
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          fetchPage(pageRef.current + 1, false);
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, fetchPage]);

  const viewUserProfile = (userData: UserWithProfile) => {
    setSelectedUser(userData);
    setUserModalOpen(true);
  };

  const handleCreateSuccess = async (newUser: User) => {
    pageRef.current = 1;
    fetchPage(1, true);
    invalidateUserBreakdownCache();
    refreshBreakdown(true);
    try {
      const fullUser = await getUser(newUser.user_id);
      if (fullUser) {
        viewUserProfile(fullUser);
        showToast("User created successfully", "success");
      }
    } catch (error) {
      console.error("Failed to load new user profile", error);
      showToast("User created but failed to open details", "warning");
    }
  };

  const toggleUserStatus = async (userId: number, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const previousUsers = users;
    setTogglingUserId(userId);
    setUsers((prev) =>
      prev.map((u) =>
        u.user.user_id === userId
          ? { ...u, user: { ...u.user, status: newStatus } }
          : u,
      ),
    );
    try {
      if (currentStatus === "ACTIVE") {
        await disableUser(userId);
        showToast("User disabled successfully", "success");
      } else {
        await enableUser(userId);
        showToast("User enabled successfully", "success");
      }
      if (selectedStatus !== "all" && newStatus !== selectedStatus) {
        setUsers((prev) => prev.filter((u) => u.user.user_id !== userId));
        setTotal((prev) => Math.max(0, prev - 1));
      }
      invalidateUserBreakdownCache();
      refreshBreakdown(true);
    } catch (error: any) {
      setUsers(previousUsers);
      showToast(
        error.response?.data?.message || "Failed to update user status",
        "error",
      );
    } finally {
      setTogglingUserId(null);
    }
  };

  const toggleExpand = (userId: number) => {
    setExpandedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const selectRole = (roleId: string) => {
    if (loading) return;
    setSelectedRole(roleId);
  };

  const selectStatus = (status: string) => {
    if (loading) return;
    setSelectedStatus(status);
  };

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setSelectedRole("all");
  };

  const hasActiveFilters = selectedRole !== "all" || debouncedSearch !== "";

  const handleExportExcel = async () => {
    if (total === 0) {
      showToast("No users to export", "warning");
      return;
    }
    setIsExporting(true);
    try {
      const result = await getUsersWithPagination(
        1,
        total,
        selectedRole === "all" ? undefined : selectedRole,
        debouncedSearch || undefined,
        selectedStatus === "all" ? undefined : selectedStatus,
      );
      const rows = (result?.users ?? []).map((u, i) => ({
        "#": i + 1,
        "Full Name":
          u.profile?.first_name && u.profile?.last_name
            ? `${u.profile.first_name} ${u.profile.last_name}`
            : u.user.username,
        Username: u.user.username,
        Email: u.user.email,
        Phone: u.user.phone_number || "—",
        Roles: u.roles?.map((r) => r.name).join(", ") || "—",
        Status: u.user.status,
      }));
      if (rows.length === 0) {
        showToast("No users to export", "warning");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = Object.keys(rows[0]).map((k) => ({
        wch: Math.max(k.length, ...rows.map((r) => String((r as any)[k]).length)) + 2,
      }));
      ws["!cols"] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Users");
      const roleLabel =
        selectedRole === "all"
          ? "all_roles"
          : roles.find((r) => r.role_id.toString() === selectedRole)?.name ??
            "role";
      XLSX.writeFile(
        wb,
        `users_${roleLabel}_${selectedStatus.toLowerCase()}_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`,
      );
      showToast(`Exported ${rows.length} users`, "success");
    } catch (error) {
      console.error("Failed to export users:", error);
      showToast("Failed to export users", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSwitchUser = async (userId: number) => {
    setIsSwitchingUser(true);
    const startTime = Date.now();
    try {
      const userData = await getUser(userId);
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < 600) {
        await new Promise((resolve) => setTimeout(resolve, 600 - elapsedTime));
      }
      if (userData) {
        setSelectedUser(userData);
      }
    } catch (error) {
      console.error("Failed to switch user", error);
      showToast("Failed to load user profile", "error");
    } finally {
      setIsSwitchingUser(false);
    }
  };

  return (
    <div>
      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end gap-2 mb-4"
      >
        <button
          onClick={handleExportExcel}
          disabled={isExporting}
          className="px-5 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-full transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Export</span>
        </button>
        <button
          onClick={() => setExcelModalOpen(true)}
          className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-full transition-colors flex items-center gap-2"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span className="hidden sm:inline">Bulk Upload</span>
        </button>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add User</span>
        </button>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4"
      >
        <StatCard
          icon={UsersIcon}
          label="Total"
          value={stats.total}
          loading={statsLoading}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          icon={ShieldCheck}
          label="Admins"
          value={stats.admins}
          loading={statsLoading}
          accent="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        />
        <StatCard
          icon={GraduationCap}
          label="Students"
          value={stats.students}
          loading={statsLoading}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <StatCard
          icon={CheckCircle}
          label="Active"
          value={stats.active}
          loading={statsLoading}
          accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        />
        <StatCard
          icon={XCircle}
          label="Disabled"
          value={stats.disabled}
          loading={statsLoading}
          accent="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
        />
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col gap-2 mb-4"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <RoleFilterDropdown
            roles={roles}
            selectedRole={selectedRole}
            roleTotals={roleTotals}
            allRoleTotal={allRoleTotal}
            statsLoading={statsLoading}
            loading={loading}
            onSelect={selectRole}
          />
        </div>
        <div
          role="tablist"
          aria-label="Filter by status"
          className="flex gap-0 overflow-x-auto pb-0 pt-2 border-b border-gray-200 dark:border-slate-700"
        >
          <button
            key="active"
            role="tab"
            aria-selected={selectedStatus === "ACTIVE"}
            onClick={() => selectStatus("ACTIVE")}
            className={`px-4 py-2 ${loading ? "cursor-not-allowed" : ""} text-sm font-medium transition-all whitespace-nowrap ${
              selectedStatus === "ACTIVE"
                ? "text-blue-500 border-b-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "text-gray-600 dark:text-gray-300 border-b-2 border-transparent hover:text-blue-500"
            }`}
          >
            Active
          </button>
          <button
            key="disabled"
            role="tab"
            aria-selected={selectedStatus === "INACTIVE"}
            onClick={() => selectStatus("INACTIVE")}
            className={`px-4 py-2 ${loading ? "cursor-not-allowed" : ""} text-sm font-medium transition-all whitespace-nowrap ${
              selectedStatus === "INACTIVE"
                ? "text-blue-500 border-b-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "text-gray-600 dark:text-gray-300 border-b-2 border-transparent hover:text-blue-500"
            }`}
          >
            Disabled
          </button>
        </div>
      </motion.div>

      {/* Users List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} delay={i * 0.03} />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          {users.length > 0 ? (
            <>
              {users.map((user: UserWithProfile, index: number) => (
                <UserItemCard
                  key={user.user.user_id}
                  user={user}
                  index={index % PAGE_SIZE}
                  onView={() => viewUserProfile(user)}
                  isExpanded={expandedUsers.includes(user.user.user_id)}
                  onToggleExpand={() => toggleExpand(user.user.user_id)}
                  onToggleStatus={() =>
                    toggleUserStatus(user.user.user_id, user.user.status)
                  }
                  isToggling={togglingUserId === user.user.user_id}
                />
              ))}
              <div className="text-center text-xs text-gray-400 py-2">
                Showing {users.length} of {total} users
              </div>
              <div ref={sentinelRef} className="h-4">
                {loadingMore && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-sm text-gray-400 flex flex-col items-center gap-2">
              <UserIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <span>No users found</span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Modals */}
      <UserProfileModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        user={selectedUser}
        onViewUser={handleSwitchUser}
        isSwitchingUser={isSwitchingUser}
      />

      <CreateUserModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      <ExcelUploadModal
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        onSuccess={() => {
          pageRef.current = 1;
          fetchPage(1, true);
          invalidateUserBreakdownCache();
          refreshBreakdown(true);
        }}
      />
    </div>
  );
};

export default UsersManagement;
