import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  User as UserIcon,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { getUsersByGrade, GradeUser } from "../api/users";
import { useToast } from "../contexts/ToastContext";
import UserProfileModal from "./UserProfileModal";

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
  isLoading,
}: {
  user: GradeUser;
  index: number;
  onClick: () => void;
  isLoading?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.02 }}
    onClick={onClick}
    className={`bg-white dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-3 border border-white/50 dark:border-slate-700/30 cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors ${
      isLoading ? "pointer-events-none opacity-50" : ""
    }`}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          {isLoading ? (
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
          ) : (
            <UserIcon className="w-4 h-4 text-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
            {user.first_name} {user.last_name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {user.phone_number && user.phone_number} • {user.email}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
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
  </motion.div>
);

// Class Teacher Users Page
const ClassTeacherUsersPage: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const [users, setUsers] = useState<GradeUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0,
  });
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userProfileModalOpen, setUserProfileModalOpen] = useState(false);
  const [loadingUserId, setLoadingUserId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  const initialLoadRef = useRef(false);
  const lastSearchRef = useRef("");

  const assignedGrades = user?.assignedGrades || [];
  const canView = user?.permissions?.includes(
    "VIEW_USERS_BY_CLASS_TEACHER_GRADE"
  );

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load users when component mounts or debounced search changes
  useEffect(() => {
    if (canView && assignedGrades.length > 0) {
      if (!initialLoadRef.current) {
        initialLoadRef.current = true;
        lastSearchRef.current = debouncedSearchTerm;
        setPagination((prev) => ({ ...prev, page: 1 }));
        loadUsers(1);
      } else if (debouncedSearchTerm !== lastSearchRef.current) {
        lastSearchRef.current = debouncedSearchTerm;
        setPagination((prev) => ({ ...prev, page: 1 }));
        loadUsers(1);
      }
    }
  }, [canView, assignedGrades, debouncedSearchTerm]);

  // Set active tab when users are loaded
  useEffect(() => {
    if (users.length > 0 && !activeTab) {
      const roles = [...new Set(users.map((u) => u.role_name).filter(Boolean))];
      if (roles.length > 0) {
        setActiveTab(roles[0] || "");
      }
    }
  }, [users, activeTab]);

  const loadUsers = async (page: number = 1) => {
    if (assignedGrades.length === 0) return;

    setLoading(true);
    try {
      // Load users from all assigned grades
      const allUsers: GradeUser[] = [];
      for (const grade of assignedGrades) {
        const result = await getUsersByGrade(grade.grade_id, {
          page,
          limit: pagination.limit,
          search: debouncedSearchTerm || undefined,
        });
        if (result) {
          allUsers.push(...result.users);
        }
      }

      // Remove duplicates based on user_id
      const uniqueUsers = allUsers.filter(
        (user, index, self) =>
          index === self.findIndex((u) => u.user_id === user.user_id)
      );

      setUsers(uniqueUsers);
      setPagination({
        ...pagination,
        page,
        total: uniqueUsers.length,
        totalPages: Math.ceil(uniqueUsers.length / pagination.limit),
      });
    } catch (error) {
      console.error("Failed to load users:", error);
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
      loadUsers(newPage);
    }
  };

  const handleUserClick = async (userId: number) => {
    setLoadingUserId(userId);
    try {
      // For now, we'll use a simple user object. In a real implementation,
      // you'd fetch the full user details from the API
      const userData = users.find((u) => u.user_id === userId);
      if (userData) {
        setSelectedUser({
          user: userData,
          profile: {
            first_name: userData.first_name,
            last_name: userData.last_name,
            user_type: userData.user_type,
          },
        });
        setUserProfileModalOpen(true);
      }
    } catch (error) {
      console.error("Failed to load user details:", error);
      showToast("Failed to load user details", "error");
    } finally {
      setLoadingUserId(null);
    }
  };

  if (!canView) {
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
                No permission to view class users.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  if (assignedGrades.length === 0) {
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
                No Grades Assigned
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You are not assigned to any grades.
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
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                Class Users
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                View students in your assigned grades
              </p>
            </div>
          </motion.div>

          {/* Users Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Users in Your Grades
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {activeTab
                    ? `${
                        users.filter((u) => u.role_name === activeTab).length
                      } ${activeTab.toLowerCase()} users`
                    : `${pagination.total} users`}
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                  }}
                  placeholder="Search users..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Role Tabs */}
            {users.length > 0 && (
              <div className="mb-6">
                <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-700">
                  {(
                    [
                      ...new Set(users.map((u) => u.role_name).filter(Boolean)),
                    ] as string[]
                  ).map((role) => (
                    <button
                      key={role}
                      onClick={() => setActiveTab(role)}
                      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                        activeTab === role
                          ? "bg-blue-500 text-white border-b-2 border-blue-500"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      {role} ({users.filter((u) => u.role_name === role).length}
                      )
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
                  users
                    .filter(
                      (user) => !activeTab || user.role_name === activeTab
                    )
                    .slice(
                      (pagination.page - 1) * pagination.limit,
                      pagination.page * pagination.limit
                    )
                    .map((user, index) => (
                      <UserCard
                        key={user.user_id}
                        user={user}
                        index={index}
                        onClick={() => handleUserClick(user.user_id)}
                        isLoading={loadingUserId === user.user_id}
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
            {!loading &&
              (() => {
                const filteredUsers = users.filter(
                  (user) => !activeTab || user.role_name === activeTab
                );
                const filteredTotal = filteredUsers.length;
                const filteredTotalPages = Math.ceil(
                  filteredTotal / pagination.limit
                );

                return filteredTotal > 0 && filteredTotalPages > 1 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Showing {(pagination.page - 1) * pagination.limit + 1}{" "}
                        to{" "}
                        {Math.min(
                          pagination.page * pagination.limit,
                          filteredTotal
                        )}{" "}
                        of {filteredTotal} users
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePageChange(pagination.page - 1)}
                          disabled={pagination.page === 1}
                          className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm text-gray-500">
                          Page {pagination.page} of {filteredTotalPages}
                        </span>
                        <button
                          onClick={() => handlePageChange(pagination.page + 1)}
                          disabled={pagination.page === filteredTotalPages}
                          className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : null;
              })()}
          </motion.div>
        </div>
      </div>

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={userProfileModalOpen}
        onClose={() => {
          setUserProfileModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
      />
    </div>
  );
};

export default ClassTeacherUsersPage;
