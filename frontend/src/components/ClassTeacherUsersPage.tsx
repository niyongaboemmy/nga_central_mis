import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  User as UserIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Layers,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { getScopedUsers, ScopedUser, ScopedRoleGroup } from "../api/users";
import { useScopedGrades } from "../hooks/useScopedGrades";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import { useToast } from "../contexts/ToastContext";
import UserProfileViewer from "./UserProfileViewer";
import UserAvatar from "./ui/UserAvatar";
import SelectField from "./ui/SelectField";

const PAGE_SIZE = 40;

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {[...Array(8)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: `${Math.random() * 100}%`,
          y: "100%",
        }}
        animate={{
          opacity: [0, 0.3, 0],
          y: "-10%",
        }}
        transition={{
          repeat: Infinity,
          duration: 20 + Math.random() * 20,
          delay: Math.random() * 20,
          ease: "linear",
        }}
        className="absolute"
        style={{ left: `${Math.random() * 100}%` }}
      >
        <div className="w-2 h-2 bg-blue-300/30 rounded-full" />
      </motion.div>
    ))}
  </div>
);

// User card component
const UserCard = ({
  user,
  index,
  onClick,
  showClassGroups,
}: {
  user: ScopedUser;
  index: number;
  onClick: () => void;
  showClassGroups: boolean;
}) => (
  <motion.button
    type="button"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: Math.min(index, 15) * 0.02 }}
    onClick={onClick}
    aria-label={`View profile of ${user.first_name ?? ""} ${
      user.last_name ?? user.username
    }`}
    className="w-full text-left bg-white dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-3 border border-white/50 dark:border-slate-700/30 cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors"
  >
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          name={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username}
          avatar={user.avatar}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
            {user.first_name || user.last_name
              ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
              : user.username}
          </h3>
          {user.registration_number && (
            <p className="text-xs text-gray-400 truncate">
              {user.registration_number}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-2">
            {user.email && (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail className="w-3 h-3" />
                {user.email}
              </span>
            )}
            {user.phone_number && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {user.phone_number}
              </span>
            )}
          </p>
          {showClassGroups && user.class_groups.length > 0 && (
            <p className="text-[11px] text-gray-400 truncate flex items-center gap-1 mt-0.5">
              <Layers className="w-3 h-3" />
              {user.class_groups.map((c) => c.name).join(", ")}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Every role, not just the first — a user can be both a teacher and a
            parent, and the old one-row-per-role query silently dropped one. */}
        <div className="hidden sm:flex flex-wrap gap-1 justify-end max-w-[220px]">
          {user.roles.map((r) => (
            <span
              key={r.role_id}
              className="px-2 py-0.5 rounded-full text-[11px] bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300"
            >
              {r.name}
            </span>
          ))}
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            user.status === "ACTIVE"
              ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
              : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {user.status}
        </span>
      </div>
    </div>
  </motion.button>
);

const EmptyState = ({ title, message }: { title: string; message: string }) => (
  <div className="min-h-screen bg-gray-50 dark:bg-black overflow-hidden relative">
    <FloatingParticles />
    <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-8"
        >
          <UserIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            {title}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </motion.div>
      </div>
    </div>
  </div>
);

// Class Teacher Users Page
const ClassTeacherUsersPage: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const scope = useScopedGrades();
  // Follow the year picked in the top nav, not just whichever year is flagged
  // current — otherwise the roster ignores the selector sitting above it.
  const { selectedYearId } = useAcademicPeriod();

  const [users, setUsers] = useState<ScopedUser[]>([]);
  const [roleGroups, setRoleGroups] = useState<ScopedRoleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeRole, setActiveRole] = useState<string>("");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const [selectedUser, setSelectedUser] = useState<ScopedUser | null>(null);

  const canView = user?.permissions?.includes(
    "VIEW_USERS_BY_CLASS_TEACHER_GRADE",
  );
  const academicYearId =
    selectedYearId ?? user?.currentAcademicYear?.academic_year_id ?? null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const gradeIds = useMemo(
    () => (gradeFilter === "all" ? scope.gradeIds : [gradeFilter]),
    [gradeFilter, scope.gradeIds],
  );

  // One request for every grade in scope. Role tab counts come back in the same
  // payload, so switching tabs doesn't need a second round trip either.
  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    getScopedUsers({
      gradeIds,
      academicYearId,
      page,
      limit: PAGE_SIZE,
      search: debouncedSearchTerm || undefined,
      role: activeRole || undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setUsers(result.items);
        setTotal(result.total);
        setRoleGroups(result.roleGroups);
      })
      .catch((error: any) => {
        if (cancelled) return;
        console.error("Failed to load users:", error);
        showToast(error?.message || "Failed to load users", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    canView,
    gradeIds,
    academicYearId,
    page,
    debouncedSearchTerm,
    activeRole,
  ]);

  const selectRole = (role: string) => {
    setActiveRole((current) => (current === role ? "" : role));
    setPage(1);
  };

  if (!canView) {
    return (
      <EmptyState
        title="Access Denied"
        message="No permission to view class users."
      />
    );
  }

  if (scope.isScoped && scope.gradeIds.length === 0) {
    return (
      <EmptyState
        title="No Grades Assigned"
        message={
          scope.source === "programs"
            ? "Your programs have no grades yet."
            : "You are not assigned to any grades."
        }
      />
    );
  }

  return (
    <div className="min-h-screen overflow-hidden relative">
      <FloatingParticles />

      <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                Class Users
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {scope.isScoped
                  ? `Students and teachers in ${scope.grades
                      .map((g) => g.name)
                      .join(", ")}`
                  : "Students and teachers across all grades"}
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Users in Your Grades
              </h3>
              <span className="text-sm text-gray-500">
                {total} {activeRole ? `${activeRole.toLowerCase()} ` : ""}user
                {total === 1 ? "" : "s"}
              </span>
            </div>

            {/* Search + grade filter */}
            <div className="mb-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search users..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {scope.grades.length > 1 && (
                <SelectField
                  value={gradeFilter}
                  onChange={(e) => {
                    setGradeFilter(
                      e.target.value === "all" ? "all" : Number(e.target.value),
                    );
                    setPage(1);
                  }}
                  className="px-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All my grades</option>
                  {scope.grades.map((g) => (
                    <option key={g.grade_id} value={g.grade_id}>
                      {g.name}
                    </option>
                  ))}
                </SelectField>
              )}
            </div>

            {/* Role Tabs — counts come from the server over the whole result
                set, not just the current page. */}
            {roleGroups.length > 0 && (
              <div className="mb-6">
                <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => selectRole("")}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                      activeRole === ""
                        ? "bg-blue-500 text-white border-b-2 border-blue-500"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    All
                  </button>
                  {roleGroups.map((group) => (
                    <button
                      key={group.role_id}
                      onClick={() => selectRole(group.name)}
                      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                        activeRole === group.name
                          ? "bg-blue-500 text-white border-b-2 border-blue-500"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      {group.name} ({group.count})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Users List */}
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-2"
              >
                {users.length > 0 ? (
                  users.map((u, index) => (
                    <UserCard
                      key={u.user_id}
                      user={u}
                      index={index}
                      onClick={() => setSelectedUser(u)}
                      showClassGroups={
                        scope.grades.length > 1 || !scope.isScoped
                      }
                    />
                  ))
                ) : (
                  <div className="text-center py-6 text-sm text-gray-400">
                    No users found
                  </div>
                )}
              </motion.div>
            )}

            {/* Pagination */}
            {!loading && total > 0 && totalPages > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                    {Math.min(page * PAGE_SIZE, total)} of {total} users
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-500">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Read-only profile */}
      <UserProfileViewer
        isOpen={selectedUser !== null}
        onClose={() => setSelectedUser(null)}
        summary={selectedUser}
        academicYearId={academicYearId}
      />
    </div>
  );
};

export default ClassTeacherUsersPage;
