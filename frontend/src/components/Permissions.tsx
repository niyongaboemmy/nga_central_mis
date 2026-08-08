import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  Users,
  Key,
  LayoutDashboard,
  Plus,
} from "lucide-react";
import { usePermissions } from "../hooks/usePermissions";
import { useToast } from "../contexts/ToastContext";
import { getAllPermissions } from "../constants/permissions";
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
import RolesTab from "./permissions/RolesTab";
import PermissionsListTab from "./permissions/PermissionsListTab";
import RolesPermissionsDashboard from "./permissions/RolesPermissionsDashboard";
import NameDescriptionModal from "./permissions/NameDescriptionModal";
import PermissionFormModal from "./permissions/PermissionFormModal";
import AssignPermissionsModal from "./permissions/AssignPermissionsModal";
import ConfirmModal from "./ui/ConfirmModal";

type Tab = "roles" | "permissions" | "dashboard";

const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {[...Array(6)].map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: `${Math.random() * 100}%`, y: "100%" }}
        animate={{ opacity: [0, 0.3, 0], y: "-10%" }}
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

const Permissions: React.FC = () => {
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionsList, setPermissionsList] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  // roleId -> permission ids currently assigned. Lets both list tabs and the
  // dashboard derive "N permissions" / "used by N roles" without re-fetching.
  const [roleAssignments, setRoleAssignments] = useState<
    Record<number, number[]>
  >({});
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const loadInitRef = useRef(false);

  // Modal state
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermission, setSelectedPermission] =
    useState<Permission | null>(null);
  const [assignSelected, setAssignSelected] = useState<number[]>([]);
  const [togglingRoleId, setTogglingRoleId] = useState<number | null>(null);
  const [togglingPermId, setTogglingPermId] = useState<number | null>(null);
  const [assigningRoleId, setAssigningRoleId] = useState<number | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [savingPermission, setSavingPermission] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [loadingAssignModal, setLoadingAssignModal] = useState(false);
  const [roleToggleConfirm, setRoleToggleConfirm] = useState<Role | null>(
    null,
  );
  const [permToggleConfirm, setPermToggleConfirm] =
    useState<Permission | null>(null);
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const [permFormError, setPermFormError] = useState<string | null>(null);

  const canManage =
    hasPermission("MANAGE_ROLES") ||
    hasPermission("MANAGE_PERMISSIONS") ||
    hasPermission("ADMIN");

  const loadRoleAssignments = useCallback(async (roleList: Role[]) => {
    setAssignmentsLoading(true);
    try {
      const entries = await Promise.all(
        roleList.map(async (role) => {
          const perms = await getRolePermissions(role.role_id);
          return [role.role_id, (perms || []).map((p) => p.perm_id)] as const;
        }),
      );
      setRoleAssignments(Object.fromEntries(entries));
    } catch (error) {
      console.error("Failed to load role permission assignments:", error);
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, permsData] = await Promise.all([
        getRoles(),
        getPermissions(),
      ]);
      const loadedRoles = rolesData || [];
      setRoles(loadedRoles);
      setPermissionsList(permsData || []);
      loadRoleAssignments(loadedRoles);
    } catch (error) {
      console.error("Failed to load roles/permissions:", error);
      showToast("Failed to load roles and permissions", "error");
    } finally {
      setLoading(false);
    }
  }, [loadRoleAssignments, showToast]);

  // Guard against React StrictMode's dev-only double effect invocation.
  useEffect(() => {
    if (loadInitRef.current) return;
    loadInitRef.current = true;
    loadData();
  }, [loadData]);

  const permissionCounts: Record<number, number> = Object.fromEntries(
    Object.entries(roleAssignments).map(([roleId, permIds]) => [
      roleId,
      permIds.length,
    ]),
  );

  const roleUsageCounts: Record<number, number> = {};
  Object.values(roleAssignments).forEach((permIds) => {
    permIds.forEach((permId) => {
      roleUsageCounts[permId] = (roleUsageCounts[permId] || 0) + 1;
    });
  });

  // ---- Role CRUD ----
  const openRoleModal = (role?: Role) => {
    setSelectedRole(role || null);
    setRoleFormError(null);
    setRoleModalOpen(true);
  };

  const handleSubmitRole = async (data: {
    name: string;
    description: string;
  }) => {
    const duplicate = roles.find(
      (r) =>
        r.name.toLowerCase() === data.name.toLowerCase() &&
        r.role_id !== selectedRole?.role_id,
    );
    if (duplicate) {
      setRoleFormError("A role with this name already exists");
      return;
    }
    setRoleFormError(null);
    setSavingRole(true);
    try {
      if (selectedRole) {
        await updateRole(selectedRole.role_id, data);
        showToast("Role updated successfully", "success");
      } else {
        await createRole(data);
        showToast("Role created successfully", "success");
      }
      setRoleModalOpen(false);
      loadData();
    } catch (error: any) {
      setRoleFormError(error.response?.data?.message || "Failed to save role");
    } finally {
      setSavingRole(false);
    }
  };

  const requestToggleRoleStatus = (role: Role) => {
    setRoleToggleConfirm(role);
  };

  const confirmToggleRoleStatus = async () => {
    const role = roleToggleConfirm;
    if (!role) return;
    setTogglingRoleId(role.role_id);
    try {
      if (role.status === "ACTIVE") {
        await disableRole(role.role_id);
        showToast("Role disabled", "success");
      } else {
        await enableRole(role.role_id);
        showToast("Role enabled", "success");
      }
      await loadData();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to update role status",
        "error",
      );
    } finally {
      setTogglingRoleId(null);
      setRoleToggleConfirm(null);
    }
  };

  // ---- Permission CRUD ----
  const openPermModal = (perm?: Permission) => {
    setSelectedPermission(perm || null);
    setPermFormError(null);
    setPermModalOpen(true);
  };

  const availablePermissionNames = getAllPermissions().filter(
    (name) => !permissionsList.some((p) => p.name === name),
  );

  const handleSubmitPermission = async (data: {
    name: string;
    description: string;
  }) => {
    const duplicate = permissionsList.find(
      (p) =>
        p.name.toLowerCase() === data.name.toLowerCase() &&
        p.perm_id !== selectedPermission?.perm_id,
    );
    if (duplicate) {
      setPermFormError("A permission with this name already exists");
      return;
    }
    setPermFormError(null);
    setSavingPermission(true);
    try {
      if (selectedPermission) {
        await updatePermission(selectedPermission.perm_id, data);
        showToast("Permission updated successfully", "success");
      } else {
        await createPermission(data);
        showToast("Permission created successfully", "success");
      }
      setPermModalOpen(false);
      loadData();
    } catch (error: any) {
      setPermFormError(
        error.response?.data?.message || "Failed to save permission",
      );
    } finally {
      setSavingPermission(false);
    }
  };

  const requestTogglePermissionStatus = (perm: Permission) => {
    setPermToggleConfirm(perm);
  };

  const confirmTogglePermissionStatus = async () => {
    const perm = permToggleConfirm;
    if (!perm) return;
    setTogglingPermId(perm.perm_id);
    try {
      if (perm.status === "ACTIVE") {
        await disablePermission(perm.perm_id);
        showToast("Permission disabled", "success");
      } else {
        await enablePermission(perm.perm_id);
        showToast("Permission enabled", "success");
      }
      await loadData();
    } catch (error: any) {
      showToast(
        error.response?.data?.message ||
          "Failed to update permission status",
        "error",
      );
    } finally {
      setTogglingPermId(null);
      setPermToggleConfirm(null);
    }
  };

  // ---- Role <-> Permission assignment ----
  const openAssignModal = async (role: Role) => {
    setSelectedRole(role);
    setAssigningRoleId(role.role_id);
    setLoadingAssignModal(true);
    setAssignModalOpen(true);
    try {
      const perms = await getRolePermissions(role.role_id);
      setAssignSelected((perms || []).map((p) => p.perm_id));
    } catch (error) {
      console.error("Failed to load role permissions:", error);
      showToast("Failed to load current permissions", "error");
      setAssignSelected(roleAssignments[role.role_id] || []);
    } finally {
      setLoadingAssignModal(false);
      setAssigningRoleId(null);
    }
  };

  const handleSaveAssignment = async (permissionIds: number[]) => {
    if (!selectedRole) return;
    setSavingAssignment(true);
    try {
      await assignPermissionsToRole(selectedRole.role_id, permissionIds);
      setRoleAssignments((prev) => ({
        ...prev,
        [selectedRole.role_id]: permissionIds,
      }));
      showToast("Permissions updated successfully", "success");
      setAssignModalOpen(false);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to assign permissions",
        "error",
      );
    } finally {
      setSavingAssignment(false);
    }
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

  const activePermissionsCount = permissionsList.filter(
    (p) => p.status === "ACTIVE",
  ).length;

  return (
    <div className="min-h-screen overflow-hidden relative">
      <FloatingParticles />

      <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                Roles &amp; Permissions
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Manage roles, permissions, and access control
              </p>
            </div>
            {activeTab !== "dashboard" && (
              <button
                onClick={() =>
                  activeTab === "roles" ? openRoleModal() : openPermModal()
                }
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 w-fit"
              >
                <Plus className="w-4 h-4" />
                New {activeTab === "roles" ? "Role" : "Permission"}
              </button>
            )}
          </motion.div>

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            role="tablist"
            aria-label="Roles & permissions view"
            className="flex gap-1 mb-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/50 dark:border-slate-700/30 rounded-full p-1 w-fit"
          >
            <button
              role="tab"
              aria-selected={activeTab === "roles"}
              onClick={() => setActiveTab("roles")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "roles"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
              }`}
            >
              <Users className="w-4 h-4" />
              Roles
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "permissions"}
              onClick={() => setActiveTab("permissions")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "permissions"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
              }`}
            >
              <Key className="w-4 h-4" />
              Permissions
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "dashboard"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
          </motion.div>

          {/* Tabs stay mounted permanently so switching never loses search
              text, scroll position, or re-fetches already-loaded data. */}
          <div className={activeTab === "roles" ? "" : "hidden"}>
            <RolesTab
              roles={roles}
              permissionCounts={permissionCounts}
              loading={loading || assignmentsLoading}
              togglingRoleId={togglingRoleId}
              assigningRoleId={assigningRoleId}
              onEdit={openRoleModal}
              onToggleStatus={requestToggleRoleStatus}
              onAssign={openAssignModal}
            />
          </div>
          <div className={activeTab === "permissions" ? "" : "hidden"}>
            <PermissionsListTab
              permissions={permissionsList}
              roleUsageCounts={roleUsageCounts}
              loading={loading || assignmentsLoading}
              togglingPermId={togglingPermId}
              onEdit={openPermModal}
              onToggleStatus={requestTogglePermissionStatus}
            />
          </div>
          <div className={activeTab === "dashboard" ? "" : "hidden"}>
            <RolesPermissionsDashboard
              roles={roles}
              totalPermissions={permissionsList.length}
              activePermissions={activePermissionsCount}
              permissionCounts={permissionCounts}
              loading={loading || assignmentsLoading}
              onSelectRole={openAssignModal}
            />
          </div>
        </div>
      </div>

      <NameDescriptionModal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={selectedRole ? "Edit Role" : "New Role"}
        subtitle={
          selectedRole
            ? "Update this role's name and description."
            : "Define a new role that can be assigned to users."
        }
        icon={Users}
        iconAccent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        namePlaceholder="Enter role name"
        initialName={selectedRole?.name}
        initialDescription={selectedRole?.description || ""}
        submitLabel={selectedRole ? "Update" : "Create"}
        saving={savingRole}
        errorMessage={roleFormError}
        onSubmit={handleSubmitRole}
      />

      <PermissionFormModal
        isOpen={permModalOpen}
        onClose={() => setPermModalOpen(false)}
        mode={selectedPermission ? "edit" : "create"}
        availableNames={availablePermissionNames}
        initialName={selectedPermission?.name}
        initialDescription={selectedPermission?.description || ""}
        saving={savingPermission}
        errorMessage={permFormError}
        onSubmit={handleSubmitPermission}
      />

      <AssignPermissionsModal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        role={selectedRole}
        permissions={permissionsList}
        initialSelected={assignSelected}
        saving={savingAssignment}
        loadingCurrent={loadingAssignModal}
        onSave={handleSaveAssignment}
      />

      <ConfirmModal
        isOpen={roleToggleConfirm !== null}
        onClose={() => setRoleToggleConfirm(null)}
        onConfirm={confirmToggleRoleStatus}
        title={
          roleToggleConfirm?.status === "ACTIVE" ? "Disable role?" : "Enable role?"
        }
        message={
          roleToggleConfirm?.status === "ACTIVE"
            ? `"${roleToggleConfirm?.name}" will no longer be assignable, and existing users with this role may lose the access it grants.`
            : `"${roleToggleConfirm?.name}" will become assignable again and existing users with this role will regain the access it grants.`
        }
        confirmText={
          roleToggleConfirm?.status === "ACTIVE" ? "Disable" : "Enable"
        }
        isLoading={
          roleToggleConfirm !== null &&
          togglingRoleId === roleToggleConfirm.role_id
        }
      />

      <ConfirmModal
        isOpen={permToggleConfirm !== null}
        onClose={() => setPermToggleConfirm(null)}
        onConfirm={confirmTogglePermissionStatus}
        title={
          permToggleConfirm?.status === "ACTIVE"
            ? "Disable permission?"
            : "Enable permission?"
        }
        message={
          permToggleConfirm?.status === "ACTIVE"
            ? `"${permToggleConfirm?.name}" will be revoked from every role that currently has it.`
            : `"${permToggleConfirm?.name}" will become available to assign to roles again.`
        }
        confirmText={
          permToggleConfirm?.status === "ACTIVE" ? "Disable" : "Enable"
        }
        isLoading={
          permToggleConfirm !== null &&
          togglingPermId === permToggleConfirm.perm_id
        }
      />
    </div>
  );
};

export default Permissions;
