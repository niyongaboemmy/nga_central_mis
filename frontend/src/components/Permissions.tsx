import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Key,
  Users,
  Plus,
  Edit2,
  X,
  ChevronRight,
  Search,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { usePermissions } from "../hooks/usePermissions";
import {
  getRoles,
  getPermissions,
  createRole,
  updateRole,
  disableRole,
  enableRole,
  createPermission,
  updatePermission,
  disablePermission,
  enablePermission,
  assignPermissionsToRole,
  getRolePermissions,
  Role,
  Permission,
} from "../api/users";

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(6)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: `${Math.random() * 100}%`,
          y: "100%",
        }}
        animate={{
          opacity: [0, 0.4, 0],
          y: "-10%",
        }}
        transition={{
          repeat: Infinity,
          duration: 10 + Math.random() * 10,
          delay: Math.random() * 10,
          ease: "linear",
        }}
        className="absolute"
        style={{
          left: `${Math.random() * 100}%`,
        }}
      >
        <div className="w-1.5 h-1.5 bg-blue-400/40 rounded-full" />
      </motion.div>
    ))}
  </div>
);

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    ACTIVE:
      "bg-green-100/50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    DISABLED:
      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-normal ${
        colors[status] || colors.ACTIVE
      }`}
    >
      {status}
    </span>
  );
};

// Modal component
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-5 w-full max-w-md shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Form input component
const FormInput = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <div className="mb-3">
    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
      {label}
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm text-gray-900 dark:text-white placeholder-gray-400"
    />
  </div>
);

// Permissions Management Page
const Permissions: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState<"roles" | "permissions">("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionsList, setPermissionsList] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal states
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermission, setSelectedPermission] =
    useState<Permission | null>(null);

  // Form states
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });
  const [permForm, setPermForm] = useState({ name: "", description: "" });
  const [selectedPerms, setSelectedPerms] = useState<number[]>([]);
  const [togglingRoleId, setTogglingRoleId] = useState<number | null>(null);
  const [togglingPermId, setTogglingPermId] = useState<number | null>(null);
  const [assigningPermissions, setAssigningPermissions] = useState(false);
  const [loadingAssignModal, setLoadingAssignModal] = useState(false);
  const [assignSearchTerm, setAssignSearchTerm] = useState("");

  // Check if user has admin permissions using role-based checking
  const canManage =
    hasPermission("MANAGE_ROLES") ||
    hasPermission("MANAGE_PERMISSIONS") ||
    hasPermission("ADMIN");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rolesData, permsData] = await Promise.all([
        getRoles(),
        getPermissions(),
      ]);
      setRoles(rolesData || []);
      setPermissionsList(permsData || []);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async () => {
    if (!roleForm.name) return;
    try {
      await createRole(roleForm);
      setRoleForm({ name: "", description: "" });
      setRoleModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to create role:", error);
    }
  };

  const handleUpdateRole = async (roleId: number) => {
    try {
      await updateRole(roleId, roleForm);
      setRoleForm({ name: "", description: "" });
      setRoleModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  const handleToggleRoleStatus = async (role: Role) => {
    setTogglingRoleId(role.role_id);
    try {
      if (role.status === "ACTIVE") {
        await disableRole(role.role_id);
      } else {
        await enableRole(role.role_id);
      }
      loadData();
    } catch (error) {
      console.error("Failed to toggle role status:", error);
    } finally {
      setTogglingRoleId(null);
    }
  };

  const handleCreatePermission = async () => {
    if (!permForm.name) return;
    try {
      await createPermission(permForm);
      setPermForm({ name: "", description: "" });
      setPermModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to create permission:", error);
    }
  };

  const handleUpdatePermission = async (permId: number) => {
    try {
      await updatePermission(permId, permForm);
      setPermForm({ name: "", description: "" });
      setPermModalOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to update permission:", error);
    }
  };

  const handleTogglePermissionStatus = async (perm: Permission) => {
    setTogglingPermId(perm.perm_id);
    try {
      if (perm.status === "ACTIVE") {
        await disablePermission(perm.perm_id);
      } else {
        await enablePermission(perm.perm_id);
      }
      loadData();
    } catch (error) {
      console.error("Failed to toggle permission status:", error);
    } finally {
      setTogglingPermId(null);
    }
  };

  const handleAssignPermissions = async () => {
    if (!selectedRole) return;
    setAssigningPermissions(true);
    try {
      await assignPermissionsToRole(selectedRole.role_id, selectedPerms);
      setAssignModalOpen(false);
      setSelectedPerms([]);
      loadData();
    } catch (error) {
      console.error("Failed to assign permissions:", error);
    } finally {
      setAssigningPermissions(false);
    }
  };

  const openRoleModal = (role?: Role) => {
    if (role) {
      setSelectedRole(role);
      setRoleForm({ name: role.name, description: role.description || "" });
    } else {
      setSelectedRole(null);
      setRoleForm({ name: "", description: "" });
    }
    setRoleModalOpen(true);
  };

  const openPermModal = (perm?: Permission) => {
    if (perm) {
      setSelectedPermission(perm);
      setPermForm({ name: perm.name, description: perm.description || "" });
    } else {
      setSelectedPermission(null);
      setPermForm({ name: "", description: "" });
    }
    setPermModalOpen(true);
  };

  const openAssignModal = async (role: Role) => {
    setSelectedRole(role);
    setLoadingAssignModal(true);
    try {
      const perms = await getRolePermissions(role.role_id);
      setSelectedPerms((perms || []).map((p) => p.perm_id));
    } catch (error) {
      console.error("Failed to load role permissions:", error);
    } finally {
      setLoadingAssignModal(false);
    }
    setAssignSearchTerm("");
    setAssignModalOpen(true);
  };

  const filteredRoles = roles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredPermissions = permissionsList.filter(
    (perm) =>
      perm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      perm.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (!canManage) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black overflow-hidden relative">
        <FloatingParticles />
        <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                Access Denied
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You don't have permission to manage roles and permissions.
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-5"
          >
            <div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-bold text-gray-800 dark:text-white"
              >
                Roles & Permissions
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-sm text-gray-500 mt-0.5"
              >
                Manage roles, permissions, and access control
              </motion.p>
            </div>
            <button
              onClick={() =>
                activeTab === "roles" ? openRoleModal() : openPermModal()
              }
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full shadow-blue-500/25 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New {activeTab === "roles" ? "Role" : "Permission"}
            </button>
          </motion.div>

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex gap-1.5 mb-4"
          >
            <button
              onClick={() => setActiveTab("roles")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeTab === "roles"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                Roles
              </div>
            </button>
            <button
              onClick={() => setActiveTab("permissions")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeTab === "permissions"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Key className="w-4 h-4" />
                Permissions
              </div>
            </button>
          </motion.div>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative mb-3"
          >
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm text-gray-900 dark:text-white placeholder-gray-400"
            />
          </motion.div>

          {/* Content - List Format */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 overflow-hidden"
            >
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-slate-700/40">
                <div className="col-span-6">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {activeTab === "roles" ? "Role" : "Permission"}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </span>
                </div>
                <div className="col-span-2 text-right">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Manage
                  </span>
                </div>
              </div>

              {/* Table Body */}
              {activeTab === "roles" ? (
                filteredRoles.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-slate-700/30">
                    {filteredRoles.map((role, index) => (
                      <div
                        key={index + 1}
                        className="grid grid-cols-12 gap-4 px-4 py-2.5 items-center hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="col-span-6">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-500 dark:from-blue-500 dark:to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <Users className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {role.name}
                              </p>
                              <p className="text-xs text-gray-400 truncate">
                                {role.description || "No description"}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2 flex items-center">
                          <StatusBadge status={role.status} />
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => openRoleModal(role)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleRoleStatus(role)}
                              disabled={togglingRoleId === role.role_id}
                              className={`p-1.5 rounded-lg transition-colors ${
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
                          </div>
                        </div>
                        <div className="col-span-2 text-right">
                          <button
                            onClick={() => openAssignModal(role)}
                            disabled={loadingAssignModal}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium inline-flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loadingAssignModal &&
                            selectedRole?.role_id === role.role_id ? (
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                            ) : (
                              <>
                                Permissions
                                <ChevronRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No roles found
                  </div>
                )
              ) : filteredPermissions.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-slate-700/30">
                  {filteredPermissions.map((perm, index) => (
                    <div
                      key={index + 1}
                      className="grid grid-cols-12 gap-4 px-4 py-2.5 items-center hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="col-span-6">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <Key className="w-3.5 h-3.5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                              {perm.name}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {perm.description || "No description"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center">
                        <StatusBadge status={perm.status} />
                      </div>
                      <div className="col-span-4 flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => openPermModal(perm)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleTogglePermissionStatus(perm)}
                          disabled={togglingPermId === perm.perm_id}
                          className={`p-1.5 rounded-lg transition-colors ${
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
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No permissions found
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Role Modal */}
      <Modal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={selectedRole ? "Edit Role" : "New Role"}
      >
        <FormInput
          label="Name"
          value={roleForm.name}
          onChange={(value) => setRoleForm({ ...roleForm, name: value })}
          placeholder="Enter role name"
        />
        <FormInput
          label="Description"
          value={roleForm.description}
          onChange={(value) => setRoleForm({ ...roleForm, description: value })}
          placeholder="Enter description"
        />
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setRoleModalOpen(false)}
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const existingRole = roles.find(
                (r) =>
                  r.name === roleForm.name &&
                  r.role_id !== selectedRole?.role_id,
              );
              if (existingRole) {
                alert("A role with this name already exists");
                return;
              }
              if (selectedRole) {
                handleUpdateRole(selectedRole.role_id);
              } else {
                handleCreateRole();
              }
            }}
            className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            {selectedRole ? "Update" : "Create"}
          </button>
        </div>
      </Modal>

      {/* Permission Modal */}
      <Modal
        isOpen={permModalOpen}
        onClose={() => setPermModalOpen(false)}
        title={selectedPermission ? "Edit Permission" : "New Permission"}
      >
        <FormInput
          label="Name"
          value={permForm.name}
          onChange={(value) => setPermForm({ ...permForm, name: value })}
          placeholder="Enter permission name"
        />
        <FormInput
          label="Description"
          value={permForm.description}
          onChange={(value) => setPermForm({ ...permForm, description: value })}
          placeholder="Enter description"
        />
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setPermModalOpen(false)}
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const existingPerm = permissionsList.find(
                (p) =>
                  p.name === permForm.name &&
                  p.perm_id !== selectedPermission?.perm_id,
              );
              if (existingPerm) {
                alert("A permission with this name already exists");
                return;
              }
              if (selectedPermission) {
                handleUpdatePermission(selectedPermission.perm_id);
              } else {
                handleCreatePermission();
              }
            }}
            className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            {selectedPermission ? "Update" : "Create"}
          </button>
        </div>
      </Modal>

      {/* Assign Permissions Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => {
          setAssignModalOpen(false);
          setAssignSearchTerm("");
        }}
        title={`Assign Permissions - ${selectedRole?.name}`}
      >
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={assignSearchTerm}
            onChange={(e) => setAssignSearchTerm(e.target.value)}
            placeholder="Search permissions..."
            className="w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-1.5 mb-3">
          {permissionsList
            .filter(
              (p) =>
                p.name.toLowerCase().includes(assignSearchTerm.toLowerCase()) ||
                (p.description || "")
                  .toLowerCase()
                  .includes(assignSearchTerm.toLowerCase()),
            )
            .map((perm) => (
              <label
                key={perm.perm_id}
                className="flex items-center gap-2.5 p-2 bg-gray-50 dark:bg-slate-900/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedPerms.includes(perm.perm_id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPerms([...selectedPerms, perm.perm_id]);
                    } else {
                      setSelectedPerms(
                        selectedPerms.filter((id) => id !== perm.perm_id),
                      );
                    }
                  }}
                  className="w-4 h-4 text-blue-500 rounded focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {perm.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {perm.description}
                  </p>
                </div>
              </label>
            ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              setAssignModalOpen(false);
              setAssignSearchTerm("");
            }}
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssignPermissions}
            disabled={assigningPermissions}
            className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assigningPermissions ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto" />
            ) : (
              "Save"
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Permissions;
