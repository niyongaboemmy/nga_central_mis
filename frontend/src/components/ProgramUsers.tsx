import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Users as UsersIcon,
  User as UserIcon,
  Search,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { programUsersApi, ProgramUser } from "../api/academics";
import { programsApi, Program } from "../api/academics";
import { useToast } from "../contexts/ToastContext";
import SelectField from "./ui/SelectField";

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

// User card component
const UserCard = ({ user, index }: { user: ProgramUser; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05 }}
    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-white/50 dark:border-slate-700/30"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
          <UserIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {user.first_name} {user.last_name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {user.username} • {user.email}
          </p>
          {user.registration_number && (
            <p className="text-xs text-gray-400">{user.registration_number}</p>
          )}
          <p className="text-xs text-gray-400">
            {user.grade_name} • {user.class_group_name}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
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

// Program Users Page
const ProgramUsers: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const [users, setUsers] = useState<ProgramUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [availablePrograms, setAvailablePrograms] = useState<Program[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const loadingRef = useRef(false);

  const canView = user?.permissions?.includes("VIEW_PROGRAM_USERS");

  const loadPrograms = async () => {
    try {
      const response = await programsApi.getAll();
      const programs = response.data.data;
      setAvailablePrograms(programs);
      // Auto-select the first program if user has assigned programs
      if (user?.assignedPrograms && user.assignedPrograms.length > 0) {
        const assignedProgram = programs.find((p: Program) =>
          user.assignedPrograms!.some(
            (ap: any) => ap.program_id === p.program_id
          )
        );
        if (assignedProgram) {
          setSelectedProgram(assignedProgram);
        }
      }
    } catch (error) {
      console.error("Failed to load programs:", error);
    }
  };

  const loadUsers = async (programId: number, page: number = 1) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const response = await programUsersApi.getByProgram(programId, {
        page,
        limit: pagination.limit,
        search: searchTerm || undefined,
      });
      setUsers(response.data.data);
      setPagination((prev) => ({
        ...prev,
        page,
        total: parseInt(response.headers["x-total-count"] || "0"),
        totalPages: Math.ceil(
          parseInt(response.headers["x-total-count"] || "0") / prev.limit
        ),
      }));
    } catch (error) {
      console.error("Failed to load users:", error);
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    if (canView) {
      loadPrograms();
    }
  }, [canView]);

  useEffect(() => {
    if (selectedProgram) {
      loadUsers(selectedProgram.program_id, 1);
    }
  }, [selectedProgram, searchTerm]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages && selectedProgram) {
      setPagination((prev) => ({ ...prev, page: newPage }));
      loadUsers(selectedProgram.program_id, newPage);
    }
  };

  const stats = {
    total: pagination.total,
    students: users.filter((u) => u.user_type === "STUDENT").length,
    teachers: users.filter((u) => u.user_type === "TEACHER").length,
    active: users.filter((u) => u.status === "ACTIVE").length,
    disabled: users.filter((u) => u.status === "INACTIVE").length,
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
                No permission to view program users.
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
                  Program Users
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  View users in your assigned programs
                </p>
              </div>
            </div>
          </motion.div>

          {/* Program Selector */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-4"
          >
            <SelectField
              value={selectedProgram?.program_id || ""}
              onChange={(e) => {
                const programId = parseInt(e.target.value);
                const program = availablePrograms.find(
                  (p) => p.program_id === programId
                );
                setSelectedProgram(program || null);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Select a program</option>
              {availablePrograms
                .filter((program) =>
                  user?.assignedPrograms?.some(
                    (ap) => ap.program_id === program.program_id
                  )
                )
                .map((program) => (
                  <option key={program.program_id} value={program.program_id}>
                    {program.name}
                  </option>
                ))}
            </SelectField>
          </motion.div>

          {selectedProgram && (
            <>
              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-5 gap-2 mb-4"
              >
                <StatCard icon={UsersIcon} label="Total" value={stats.total} />
                <StatCard
                  icon={UsersIcon}
                  label="Students"
                  value={stats.students}
                />
                <StatCard
                  icon={UsersIcon}
                  label="Teachers"
                  value={stats.teachers}
                />
                <StatCard
                  icon={CheckCircle}
                  label="Active"
                  value={stats.active}
                />
                <StatCard
                  icon={XCircle}
                  label="Disabled"
                  value={stats.disabled}
                />
              </motion.div>

              {/* Search */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mb-4"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    placeholder="Search users..."
                    className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                  />
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
                    users.map((user, index) => (
                      <UserCard key={user.user_id} user={user} index={index} />
                    ))
                  ) : (
                    <div className="text-center py-6 text-sm text-gray-400">
                      No users found in this program
                    </div>
                  )}
                </motion.div>
              )}

              {/* Pagination */}
              {!loading &&
                pagination.total > 0 &&
                pagination.totalPages > 1 && (
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
                          pagination.total
                        )}{" "}
                        of {pagination.total} users
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
                          Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <button
                          onClick={() => handlePageChange(pagination.page + 1)}
                          disabled={pagination.page === pagination.totalPages}
                          className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgramUsers;
