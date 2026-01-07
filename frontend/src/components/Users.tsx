import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users as UsersIcon,
  User as UserIcon,
  Shield,
  Mail,
  Search,
  ChevronDown,
  CheckCircle,
  Plus,
  FileSpreadsheet,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { getUsers, UserWithProfile, UserRole } from "../api/users";
import UserProfileModal from "./UserProfileModal";
import ExcelUploadModal from "./ExcelUploadModal";
import { CreateUserModal } from "./CreateUserModal";

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

// Status badge with icon
const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    ACTIVE: {
      color:
        "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
      icon: CheckCircle,
    },
    INACTIVE: {
      color:
        "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
      icon: CheckCircle,
    },
    SUSPENDED: {
      color: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
      icon: CheckCircle,
    },
  };
  const { color, icon: Icon } = config[status] || config.ACTIVE;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}
    >
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

// User type badge
const UserTypeBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    ADMIN:
      "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
    STUDENT: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    TEACHER:
      "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    PARENT:
      "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    STAFF: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  const color =
    colors[type] ||
    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${color}`}>
      {type}
    </span>
  );
};

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

// Compact user row
const UserRow = ({
  user,
  index,
  onView,
  isExpanded,
  onToggleExpand,
}: {
  user: UserWithProfile;
  index: number;
  onView: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) => {
  const userType = user.profile?.user_type || "USER";

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="group"
    >
      <div
        className="flex items-center gap-3 p-3 bg-white/90 dark:bg-slate-800/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-slate-700/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-sm transition-all cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* Avatar */}
        <div className="relative">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <UserIcon className="w-5 h-5 text-white" />
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${
              user.user.status === "ACTIVE" ? "bg-green-500" : "bg-slate-400"
            }`}
          />
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
              {user.profile?.first_name && user.profile?.last_name
                ? `${user.profile.first_name} ${user.profile.last_name}`
                : user.user.username}
            </h3>
            <UserTypeBadge type={userType} />
          </div>
          <p className="text-xs text-gray-400 truncate">{user.user.email}</p>
        </div>

        {/* Quick Stats */}
        <div className="hidden sm:flex items-center gap-4 text-xs">
          <span className="text-gray-500">{user.roles?.length || 0} roles</span>
          <StatusBadge status={user.user.status} />
        </div>

        {/* Expand Icon */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          className="text-gray-400"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </div>

      {/* Expanded Content */}
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{
          height: isExpanded ? "auto" : 0,
          opacity: isExpanded ? 1 : 0,
        }}
        className="overflow-hidden"
      >
        <div className="pt-2 pl-3 pr-3 pb-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* Contact */}
            <div className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl text-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <Mail className="w-3 h-3 text-gray-400" />
                <span className="font-bold text-black dark:text-gray-300 text-sm">
                  Contact
                </span>
              </div>
              <p className="text-gray-500 truncate">{user.user.email}</p>
              <p className="text-gray-500">
                {user.user.phone_number || "No phone"}
              </p>
            </div>

            {/* Roles */}
            <div className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl text-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="w-3 h-3 text-violet-500" />
                <span className="font-bold text-black dark:text-gray-300 text-sm">
                  Roles
                </span>
              </div>
              {user.roles && user.roles.length > 0 ? (
                <p className="text-gray-500">
                  {user.roles.map((r: UserRole) => r.name).join(", ")}
                </p>
              ) : (
                <p className="text-gray-500">No roles</p>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl text-xs flex items-center justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
                className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors text-sm font-medium"
              >
                View Profile
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Users Management Page
const Users: React.FC = () => {
  const { permissions } = useUser();
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithProfile | null>(
    null
  );
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedUsers, setExpandedUsers] = useState<number[]>([]);

  const canManage =
    permissions.includes("MANAGE_USERS") || permissions.includes("ADMIN");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data || []);
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  };

  const viewUserProfile = (userData: UserWithProfile) => {
    setSelectedUser(userData);
    setUserModalOpen(true);
  };

  const getUserType = (user: UserWithProfile): string => {
    return user.profile?.user_type || "USER";
  };

  const toggleExpand = (userId: number) => {
    setExpandedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.profile?.first_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      user.profile?.last_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      filterType === "all" || getUserType(user) === filterType;
    return matchesSearch && matchesType;
  });

  const userTypes = ["all", "ADMIN", "STUDENT", "TEACHER", "PARENT", "STAFF"];

  const stats = {
    total: users.length,
    admins: users.filter((u) => getUserType(u) === "ADMIN").length,
    students: users.filter((u) => getUserType(u) === "STUDENT").length,
    active: users.filter((u) => u.user.status === "ACTIVE").length,
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
            className="grid grid-cols-4 gap-2 mb-4"
          >
            <StatCard icon={UsersIcon} label="Total" value={stats.total} />
            <StatCard icon={UsersIcon} label="Admins" value={stats.admins} />
            <StatCard
              icon={UsersIcon}
              label="Students"
              value={stats.students}
            />
            <StatCard icon={CheckCircle} label="Active" value={stats.active} />
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
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {userTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    filterType === type
                      ? "bg-blue-500 text-white"
                      : "bg-white/60 dark:bg-slate-800/60 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {type === "all"
                    ? "All"
                    : type.charAt(0) + type.slice(1).toLowerCase()}
                </button>
              ))}
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
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user, index) => (
                  <UserRow
                    key={user.user.user_id}
                    user={user}
                    index={index}
                    onView={() => viewUserProfile(user)}
                    isExpanded={expandedUsers.includes(user.user.user_id)}
                    onToggleExpand={() => toggleExpand(user.user.user_id)}
                  />
                ))
              ) : (
                <div className="text-center py-6 text-sm text-gray-400">
                  No users found
                </div>
              )}
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
        onSuccess={loadUsers}
      />

      <ExcelUploadModal
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        onSuccess={loadUsers}
      />
    </div>
  );
};

export default Users;
