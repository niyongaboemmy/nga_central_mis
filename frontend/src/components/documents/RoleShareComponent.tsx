import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiShield,
  FiSearch,
  FiUsers,
  FiChevronLeft,
  FiChevronRight,
  FiX,
  FiCheck,
  FiChevronDown,
} from "react-icons/fi";
import { roleApi, type Role, type UserSearchResult } from "../../api/documents";
import {
  classGroupsApi,
  gradesApi,
  type ClassGroup,
} from "../../api/academics";
import { getInitials, getAvatarColor } from "./types";

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface RoleShareComponentProps {
  roles: Role[];
  selectedRoles: Role[];
  selectedUsers: UserSearchResult[];
  onToggleRole: (role: Role) => void;
  onRemoveRole: (roleId: number) => void;
  onUserSelect: (user: UserSearchResult) => void;
  onUserRemove: (userId: number) => void;
  onClearAllUsers: () => void;
  isLoadingRoles: boolean;
}

const RoleShareComponent: React.FC<RoleShareComponentProps> = ({
  roles,
  selectedRoles,
  selectedUsers,
  onToggleRole,
  onRemoveRole,
  onUserSelect,
  onUserRemove,
  onClearAllUsers,
  isLoadingRoles,
}) => {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [allUsersInGrade, setAllUsersInGrade] = useState<UserSearchResult[]>(
    [],
  );
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null);
  const [selectedClassGroupId, setSelectedClassGroupId] = useState<
    number | null
  >(null);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [grades, setGrades] = useState<{ grade_id: number; name: string }[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredUsers, setFilteredUsers] = useState<UserSearchResult[]>([]);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedRole) fetchUsersByGrade();
    else {
      setUsers([]);
      setAllUsersInGrade([]);
      setPagination(null);
    }
  }, [selectedRole, selectedGradeId]);

  useEffect(() => {
    setUsers(allUsersInGrade);
  }, [selectedClassGroupId, allUsersInGrade]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      setFilteredUsers(
        users.filter(
          (u) =>
            u.username.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.first_name && u.first_name.toLowerCase().includes(q)) ||
            (u.last_name && u.last_name.toLowerCase().includes(q)),
        ),
      );
    } else {
      setFilteredUsers(users);
    }
  }, [searchQuery, users]);

  useEffect(() => {
    fetchGrades();
    fetchClassGroups();
  }, []);

  const fetchGrades = async () => {
    try {
      const response = await gradesApi.getAll();
      if (response.data) {
        const d = response.data.data || response.data;
        if (Array.isArray(d))
          setGrades(
            d.map((g: any) => ({
              grade_id: g.grade_id,
              name: g.grade_name || g.name || `Grade ${g.grade_id}`,
            })),
          );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClassGroups = async () => {
    try {
      const response = await classGroupsApi.getAll();
      if (response.data?.data) setClassGroups(response.data.data);
      else if (Array.isArray(response.data)) setClassGroups(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsersByGrade = async () => {
    if (!selectedRole) return;
    try {
      setIsLoadingUsers(true);
      const params: any = { page: 1, limit: 1000 };
      if (selectedGradeId) params.gradeId = selectedGradeId;
      const response = await roleApi.getUsersByRole(
        selectedRole.role_id,
        params,
      );
      if (response.data) {
        const data = response.data.data || response.data;
        const all = data.users || [];
        setAllUsersInGrade(all);
        setUsers(all);
        setPagination(data.pagination || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchUsers = async (page = 1) => {
    if (!selectedRole) return;
    try {
      setIsLoadingUsers(true);
      const params: any = { page, limit: 20 };
      if (selectedGradeId) params.gradeId = selectedGradeId;
      if (selectedClassGroupId) params.classGroupId = selectedClassGroupId;
      const response = await roleApi.getUsersByRole(
        selectedRole.role_id,
        params,
      );
      if (response.data) {
        const data = response.data.data || response.data;
        setUsers(data.users || []);
        setPagination(data.pagination || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handlePageChange = (p: number) => {
    if (p >= 1 && pagination && p <= pagination.totalPages) fetchUsers(p);
  };

  const handleUserSelect = (user: UserSearchResult) => {
    const isSelected = selectedUsers.some((u) => u.user_id === user.user_id);
    if (isSelected) {
      onUserRemove(user.user_id);
    } else {
      onUserSelect(user);
    }
  };

  const filteredClassGroups = React.useMemo(
    () =>
      selectedGradeId
        ? classGroups.filter((cg) => cg.grade_id === selectedGradeId)
        : classGroups,
    [classGroups, selectedGradeId],
  );

  const clearFilters = () => {
    setSelectedGradeId(null);
    setSelectedClassGroupId(null);
    setSearchQuery("");
  };
  const hasActiveFilters = !!(
    selectedGradeId ||
    selectedClassGroupId ||
    searchQuery
  );

  // Whether the role currently being browsed has been explicitly marked as a
  // share target (distinct from merely being browsed — see the toggle below).
  const isSelectedRoleSharedWhole = !!(
    selectedRole &&
    selectedRoles.some((r) => r.role_id === selectedRole.role_id)
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      )
        setIsRoleDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredRoles = roles.filter((r) =>
    r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()),
  );
  const getDisplayName = (u: UserSearchResult) =>
    u.first_name || u.last_name
      ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
      : u.username;

  return (
    <div className="space-y-4">
      {/* ══════════════════════════════════════════════
          TOP ROW — Role selector + selected chips
      ══════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row gap-3 items-start">
        {/* Role Dropdown */}
        <div
          className="relative w-full sm:w-60 flex-shrink-0"
          ref={dropdownRef}
        >
          <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">
            Role
          </label>
          {isLoadingRoles ? (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Loading…</span>
            </div>
          ) : (
            <>
              <motion.button
                type="button"
                whileTap={{ scale: 0.99 }}
                onClick={() => setIsRoleDropdownOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all shadow-sm text-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${selectedRole ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-400"}`}
                  >
                    <FiShield className="w-3.5 h-3.5" />
                  </div>
                  <span
                    className={
                      selectedRole
                        ? "text-gray-800 dark:text-gray-100 font-medium"
                        : "text-gray-400"
                    }
                  >
                    {selectedRole ? selectedRole.name : "Choose a role…"}
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: isRoleDropdownOpen ? 180 : 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <FiChevronDown className="w-4 h-4 text-gray-400" />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {isRoleDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.14 }}
                    className="absolute z-30 w-full mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
                  >
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                      <div className="relative">
                        <FiSearch className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          autoFocus
                          type="text"
                          value={roleSearchQuery}
                          onChange={(e) => setRoleSearchQuery(e.target.value)}
                          placeholder="Search roles…"
                          className="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-transparent rounded-lg text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="max-h-52 overflow-y-auto py-1">
                      {filteredRoles.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-400 text-center">
                          No roles found
                        </p>
                      ) : (
                        filteredRoles.map((role) => {
                          const isSel = selectedRoles.some(
                            (r) => r.role_id === role.role_id,
                          );
                          return (
                            <motion.button
                              key={role.role_id}
                              whileHover={{ x: 3 }}
                              type="button"
                              onClick={() => {
                                // Only changes which role's members are being
                                // browsed — does NOT share with this role.
                                // Sharing with the whole role is a separate,
                                // explicit action (the toggle in the panel).
                                setSelectedRole(role);
                                onClearAllUsers();
                                setIsRoleDropdownOpen(false);
                                setRoleSearchQuery("");
                              }}
                              className={`w-full px-3 py-2 flex items-center justify-between transition-colors ${isSel ? "bg-blue-50 dark:bg-blue-900/25" : "hover:bg-gray-50 dark:hover:bg-gray-700/60"}`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-6 h-6 rounded-md flex items-center justify-center ${isSel ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-500"}`}
                                >
                                  <FiShield className="w-3 h-3" />
                                </div>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                  {role.name}
                                </span>
                              </div>
                              {isSel && (
                                <FiCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                              )}
                            </motion.button>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Selected role chips */}
        <AnimatePresence>
          {selectedRoles.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 pt-0 sm:pt-6"
            >
              <div className="flex flex-wrap gap-1.5">
                {selectedRoles.map((role) => (
                  <motion.div
                    key={role.role_id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className="flex items-center gap-1.5 pl-2 pr-1 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium"
                  >
                    <FiShield className="w-3 h-3 flex-shrink-0" />
                    <span>{role.name}</span>
                    <button
                      onClick={() => {
                        onRemoveRole(role.role_id);
                        if (selectedRole?.role_id === role.role_id) {
                          setSelectedRole(null);
                          onClearAllUsers();
                        }
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-800 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors ml-0.5"
                    >
                      <FiX className="w-2.5 h-2.5" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══════════════════════════════════════════════
          MAIN PANEL — Filters sidebar + User list
      ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedRole && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="flex rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm"
            style={{ height: 420 }}
          >
            {/* ── LEFT: Filters sidebar ── */}
            <div className="w-48 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gradient-to-b from-blue-50/70 to-indigo-50/40 dark:from-blue-900/10 dark:to-indigo-900/5">
              {/* Filters header — larger text */}
              <div className="px-4 py-3 border-b border-blue-100/60 dark:border-gray-700">
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400 tracking-wide">
                  Filters
                </p>
                {hasActiveFilters && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={clearFilters}
                    className="text-[10px] text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300 hover:underline mt-0.5 block transition-colors"
                  >
                    Clear all
                  </motion.button>
                )}
              </div>

              <div className="flex-1 overflow-y-scroll px-3 py-3 space-y-3">
                {/* Grade */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">
                    Grade
                  </label>
                  <div className="relative">
                    <select
                      value={selectedGradeId || ""}
                      onChange={(e) => {
                        setSelectedGradeId(
                          e.target.value ? Number(e.target.value) : null,
                        );
                        setSelectedClassGroupId(null);
                      }}
                      className="w-full appearance-none pl-2.5 pr-5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer transition-colors hover:border-blue-300"
                    >
                      <option value="">All grades</option>
                      {grades.map((g) => (
                        <option key={g.grade_id} value={g.grade_id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Class */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">
                    Class
                  </label>
                  <div className="relative">
                    <select
                      value={selectedClassGroupId || ""}
                      onChange={(e) =>
                        setSelectedClassGroupId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={!selectedGradeId && grades.length > 0}
                      className="w-full appearance-none pl-2.5 pr-5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:border-blue-300 disabled:hover:border-gray-200"
                    >
                      <option value="">
                        {selectedGradeId ? "All classes" : "Grade first"}
                      </option>
                      {filteredClassGroups.map((cg) => (
                        <option
                          key={cg.class_group_id}
                          value={cg.class_group_id}
                        >
                          {cg.name}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Search */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">
                    Search
                  </label>
                  <div className="relative">
                    <FiSearch className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Name or email…"
                      className="w-full pl-6 pr-5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors hover:border-blue-300"
                    />
                    <AnimatePresence>
                      {searchQuery && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <FiX className="w-3 h-3" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Active chips */}
                <AnimatePresence>
                  {hasActiveFilters && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-wrap gap-1"
                    >
                      {selectedGradeId && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-medium">
                          {
                            grades.find((g) => g.grade_id === selectedGradeId)
                              ?.name
                          }
                          <button onClick={() => setSelectedGradeId(null)}>
                            <FiX className="w-2 h-2" />
                          </button>
                        </span>
                      )}
                      {selectedClassGroupId && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-medium">
                          {
                            filteredClassGroups.find(
                              (cg) =>
                                cg.class_group_id === selectedClassGroupId,
                            )?.name
                          }
                          <button onClick={() => setSelectedClassGroupId(null)}>
                            <FiX className="w-2 h-2" />
                          </button>
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── RIGHT: User list ── */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Header */}
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">
                    {selectedRole.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {filteredUsers.length} user
                    {filteredUsers.length !== 1 ? "s" : ""}
                    {selectedUsers.length > 0 && (
                      <span className="ml-1.5 text-green-500 font-semibold">
                        · {selectedUsers.length} selected
                      </span>
                    )}
                  </p>
                </div>
                {selectedUsers.length > 0 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onClearAllUsers}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-medium transition-colors"
                  >
                    Deselect all
                  </motion.button>
                )}
              </div>

              {/* Explicit "share with entire role" toggle — browsing this
                  role's members above does NOT by itself share with the
                  role; this is the only action that does. */}
              <button
                type="button"
                onClick={() => onToggleRole(selectedRole)}
                className={`flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-xs font-medium transition-colors flex-shrink-0 ${
                  isSelectedRoleSharedWhole
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                    isSelectedRoleSharedWhole
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  {isSelectedRoleSharedWhole && (
                    <FiCheck className="w-2.5 h-2.5 text-white" />
                  )}
                </span>
                Share with entire {selectedRole.name} role
              </button>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto">
                {isLoadingUsers ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-xs text-gray-400">Loading…</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <FiUsers className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">
                      No users found
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredUsers.map((user, i) => {
                      const isSel = selectedUsers.some(
                        (u) => u.user_id === user.user_id,
                      );
                      return (
                        <motion.li
                          key={user.user_id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(i * 0.012, 0.18) }}
                        >
                          <button
                            onClick={() => handleUserSelect(user)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left group ${
                              isSel
                                ? "bg-green-50 dark:bg-green-900/15"
                                : "hover:bg-gray-50 dark:hover:bg-gray-700/40"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${getAvatarColor(user.username)}`}
                            >
                              {getInitials(
                                user.first_name,
                                user.last_name,
                                user.username,
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium truncate leading-tight ${isSel ? "text-green-700 dark:text-green-300" : "text-gray-700 dark:text-gray-200"}`}
                              >
                                {getDisplayName(user)}
                              </p>
                              <p className="text-xs text-gray-400 truncate">
                                {user.email}
                              </p>
                            </div>

                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                isSel
                                  ? "bg-green-500 border-green-500"
                                  : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400"
                              }`}
                            >
                              {isSel && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 20,
                                  }}
                                >
                                  <FiCheck className="w-3 h-3 text-white" />
                                </motion.div>
                              )}
                            </div>
                          </button>
                        </motion.li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Pagination footer */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 bg-gray-50/50 dark:bg-gray-800">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <FiChevronLeft className="w-3.5 h-3.5" /> Prev
                  </motion.button>
                  <span className="text-xs text-gray-400">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <FiChevronRight className="w-3.5 h-3.5" />
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════
          SELECTED USERS STRIP
      ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-2xl border border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-green-100 dark:border-green-800">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">
                  {selectedUsers.length} selected
                </p>
              </div>
              <button
                onClick={onClearAllUsers}
                className="text-xs text-green-600 dark:text-green-400 hover:underline font-medium"
              >
                Clear all
              </button>
            </div>
            <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
              {selectedUsers.map((user) => (
                <motion.div
                  key={user.user_id}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-full text-xs font-medium"
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${getAvatarColor(user.username)}`}
                  >
                    {getInitials(
                      user.first_name,
                      user.last_name,
                      user.username,
                    )}
                  </div>
                  <span className="truncate max-w-[90px]">
                    {user.first_name || user.last_name || user.username}
                  </span>
                  <button
                    onClick={() => onUserRemove(user.user_id)}
                    className="w-4 h-4 flex items-center justify-center rounded-full bg-green-100 dark:bg-green-800 hover:bg-green-200 dark:hover:bg-green-700 transition-colors ml-0.5"
                  >
                    <FiX className="w-2.5 h-2.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RoleShareComponent;
