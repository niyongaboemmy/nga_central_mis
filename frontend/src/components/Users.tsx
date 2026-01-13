import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Users as UsersIcon,
  User as UserIcon,
  Search,
  CheckCircle,
  XCircle,
  Plus,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import {
  getUsersWithPagination,
  UserWithProfile,
  enableUser,
  disableUser,
  getRoles,
  Role,
} from "../api/users";
import UserProfileModal from "./UserProfileModal";
import ExcelUploadModal from "./ExcelUploadModal";
import { CreateUserModal } from "./CreateUserModal";
import UserItemCard from "./UserItemCard";
import { useToast } from "../contexts/ToastContext";

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

// Compact stat card
const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) => (
  <motion.div
    whileHover={{ y: -1 }}
    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-3 border border-white/50 dark:border-slate-700/30 cursor-pointer"
  >
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900 dark:text-white">
          {value}
        </p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  </motion.div>
);

// Users Management Page
const Users: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithProfile | null>(
    null
  );
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");
  const [expandedUsers, setExpandedUsers] = useState<number[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const loadingRef = useRef(false);
  const loadRolesCalledRef = useRef(false);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);

  const canManage = user?.roles?.find((itm) =>
    itm.permissions?.find(
      (perm) =>
        perm.name.includes("MANAGE_USERS") || perm.name.includes("ADMIN")
    )
  );

  const loadRoles = async () => {
    if (loadRolesCalledRef.current) return;
    loadRolesCalledRef.current = true;
    try {
      const roles = await getRoles();
      if (roles) {
        setAvailableRoles(roles);
        if (roles.length > 0) {
          // Default to first role's role_id (as string) to match backend userRole filter
          setSelectedRole(roles[0].role_id.toString());
        }
      }
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const loadUsers = async (role_id: string, status: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await getUsersWithPagination(
        pagination.page,
        pagination.limit,
        role_id === "all" ? undefined : role_id,
        searchTerm || undefined,
        status === "all" ? undefined : status
      );
      if (result) {
        setUsers(result.users);
        setPagination((prev) => ({
          ...prev,
          total: result.total,
          totalPages: result.totalPages,
        }));
      }
    } catch (error) {
      console.error("Failed to load users:", error);
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  // Load users whenever filters change
  useEffect(() => {
    loadUsers(selectedRole, selectedStatus);
  }, [selectedRole, selectedStatus, pagination.page, searchTerm]);

  const viewUserProfile = (userData: UserWithProfile) => {
    setSelectedUser(userData);
    setUserModalOpen(true);
  };

  const toggleUserStatus = async (userId: number, currentStatus: string) => {
    setTogglingUserId(userId);
    try {
      if (currentStatus === "ACTIVE") {
        await disableUser(userId);
        showToast("User disabled successfully", "success");
      } else {
        await enableUser(userId);
        showToast("User enabled successfully", "success");
      }
      // Refresh the user list
      await loadUsers(selectedRole, selectedStatus);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to update user status",
        "error"
      );
    } finally {
      setTogglingUserId(null);
    }
  };

  const toggleExpand = (userId: number) => {
    setExpandedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
    }
  };

  const getUserType = (user: UserWithProfile): string => {
    return user.profile?.user_type || "USER";
  };

  const stats = {
    total: pagination.total,
    admins: users.filter((u) => getUserType(u) === "ADMIN").length,
    students: users.filter((u) => getUserType(u) === "STUDENT").length,
    active: users.filter((u) => u.user.status === "ACTIVE").length,
    disabled: users.filter((u) => u.user.status === "INACTIVE").length,
  };

  if (!canManage) {
    return (
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
                Access Denied
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No permission to view user management.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                  Users Management
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  View and manage all users
                </p>
              </div>
              <div className="flex gap-2">
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
              </div>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-5 gap-2 mb-4"
          >
            <StatCard icon={UsersIcon} label="Total" value={stats.total} />
            <StatCard icon={UsersIcon} label="Admins" value={stats.admins} />
            <StatCard
              icon={UsersIcon}
              label="Students"
              value={stats.students}
            />
            <StatCard icon={CheckCircle} label="Active" value={stats.active} />
            <StatCard icon={XCircle} label="Disabled" value={stats.disabled} />
          </motion.div>

          {/* Search & Filters */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-2 mb-4"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page on search
                }}
                placeholder="Search users..."
                className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 pt-2">
              <button
                key="all"
                onClick={() => {
                  setSelectedRole("all");
                  setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page on role change
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  selectedRole === "all"
                    ? "bg-blue-500 text-white"
                    : "bg-white/60 dark:bg-slate-800/60 text-gray-600 dark:text-gray-300"
                }`}
              >
                All
              </button>
              {availableRoles.map((role) => (
                <button
                  key={role.role_id}
                  onClick={() => {
                    setSelectedRole(role.role_id.toString());
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    selectedRole.toString() === role.role_id.toString()
                      ? "bg-blue-500 text-white"
                      : "bg-white/60 dark:bg-slate-800/60 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {role.name}
                </button>
              ))}
            </div>
            <div className="flex gap-0 overflow-x-auto pb-0 pt-2 border-b border-gray-200 dark:border-slate-700">
              <button
                key="active"
                onClick={() => {
                  setSelectedStatus("ACTIVE");
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className={`px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                  selectedStatus === "ACTIVE"
                    ? "text-blue-500 border-b-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "text-gray-600 dark:text-gray-300 border-b-2 border-transparent hover:text-blue-500"
                }`}
              >
                Active
              </button>
              <button
                key="disabled"
                onClick={() => {
                  setSelectedStatus("INACTIVE");
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className={`px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
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
                users.map((user: UserWithProfile, index: number) => (
                  <UserItemCard
                    key={user.user.user_id}
                    user={user}
                    index={index}
                    onView={() => viewUserProfile(user)}
                    isExpanded={expandedUsers.includes(user.user.user_id)}
                    onToggleExpand={() => toggleExpand(user.user.user_id)}
                    onToggleStatus={() =>
                      toggleUserStatus(user.user.user_id, user.user.status)
                    }
                    isToggling={togglingUserId === user.user.user_id}
                  />
                ))
              ) : (
                <div className="text-center py-6 text-sm text-gray-400">
                  No users found
                </div>
              )}
            </motion.div>
          )}

          {/* Enhanced Pagination */}
          {!loading && pagination.total > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Left side - Results info and rows per page */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="text-sm text-gray-500">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    )}{" "}
                    of {pagination.total} users
                  </div>

                  {/* Rows per page selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Show:</span>
                    <select
                      value={pagination.limit}
                      onChange={(e) => {
                        const newLimit = parseInt(e.target.value);
                        setPagination((prev) => ({
                          ...prev,
                          limit: newLimit,
                          page: 1, // Reset to first page when changing limit
                        }));
                      }}
                      className="px-2 py-1 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-sm text-gray-500">per page</span>
                  </div>
                </div>

                {/* Right side - Page navigation */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    {/* First page */}
                    <button
                      onClick={() => handlePageChange(1)}
                      disabled={pagination.page === 1}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      title="First page"
                    >
                      <ChevronLeft className="w-4 h-4 rotate-180" />
                      <ChevronLeft className="w-4 h-4 -ml-2 rotate-180" />
                    </button>

                    {/* Previous page */}
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      title="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Page numbers */}
                    <div className="flex items-center gap-1">
                      {(() => {
                        const pages = [];
                        const startPage = Math.max(1, pagination.page - 2);
                        const endPage = Math.min(
                          pagination.totalPages,
                          pagination.page + 2
                        );

                        // Add first page if not in range
                        if (startPage > 1) {
                          pages.push(
                            <button
                              key={1}
                              onClick={() => handlePageChange(1)}
                              className="px-3 py-1 text-sm rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              1
                            </button>
                          );
                          if (startPage > 2) {
                            pages.push(
                              <span
                                key="start-ellipsis"
                                className="px-2 text-gray-400"
                              >
                                ...
                              </span>
                            );
                          }
                        }

                        // Add pages in range
                        for (let i = startPage; i <= endPage; i++) {
                          pages.push(
                            <button
                              key={i}
                              onClick={() => handlePageChange(i)}
                              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                i === pagination.page
                                  ? "bg-blue-500 text-white border-blue-500"
                                  : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700"
                              }`}
                            >
                              {i}
                            </button>
                          );
                        }

                        // Add last page if not in range
                        if (endPage < pagination.totalPages) {
                          if (endPage < pagination.totalPages - 1) {
                            pages.push(
                              <span
                                key="end-ellipsis"
                                className="px-2 text-gray-400"
                              >
                                ...
                              </span>
                            );
                          }
                          pages.push(
                            <button
                              key={pagination.totalPages}
                              onClick={() =>
                                handlePageChange(pagination.totalPages)
                              }
                              className="px-3 py-1 text-sm rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              {pagination.totalPages}
                            </button>
                          );
                        }

                        return pages;
                      })()}
                    </div>

                    {/* Next page */}
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      title="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    {/* Last page */}
                    <button
                      onClick={() => handlePageChange(pagination.totalPages)}
                      disabled={pagination.page === pagination.totalPages}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      title="Last page"
                    >
                      <ChevronRight className="w-4 h-4 -mr-2" />
                      <ChevronRight className="w-4 h-4 -mr-2" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Modals */}
      <UserProfileModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        user={selectedUser}
      />

      <CreateUserModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => loadUsers(selectedRole, selectedStatus)}
      />

      <ExcelUploadModal
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        onSuccess={() => loadUsers(selectedRole, selectedStatus)}
      />
    </div>
  );
};

export default Users;
