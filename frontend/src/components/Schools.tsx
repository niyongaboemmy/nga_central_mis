import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  School as SchoolIcon,
  Plus,
  Search,
  Edit,
  Power,
  RotateCcw,
  MapPin,
  Mail,
  Phone,
  Settings,
  Layers,
  Shield,
  Check,
  Building,
  Loader2,
  Upload,
  X,
  AlertCircle,
  ArrowUpRight,
  Star,
  Trash2,
} from "lucide-react";
import Modal from "./ui/Modal";
import { useToast } from "../contexts/ToastContext";
import {
  getSchools,
  createSchool,
  updateSchool,
  deleteSchool,
  uploadSchoolLogo,
  removeSchoolLogo,
  getSchoolLogoUrl,
  validateSchool,
  schoolPayload,
  SCHOOL_LIMITS,
  LOGO_MAX_BYTES,
  School,
  SchoolLogoSlot,
  SchoolTextField,
} from "../api/schools";
import {
  getSystems,
  getSchoolSystems,
  getSchoolRoleAssignments,
  assignSystemToSchool,
  removeSystemFromSchool,
  assignSystemToRoleInSchool,
  removeSystemFromRoleInSchool,
  System,
  RoleAssignment,
} from "../api/systems";
import { getRoles, Role } from "../api/users";
import { useConfirm } from "../contexts/ConfirmContext";
import SelectField from "./ui/SelectField";
import { isSystemEntitled, useTenantStatus } from "./tenantMgmt/account/usePackage";
import { usePermissions } from "../hooks/usePermissions";
import { useAccess } from "../hooks/useAccess";
import { refreshBranding } from "../hooks/useTenantBranding";
import TenantLogo from "./brand/TenantLogo";

type Status = School["status"];
const STATUS_STYLE: Record<Status, string> = {
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  INACTIVE: "bg-gray-100 text-gray-600 dark:bg-slate-700/60 dark:text-gray-300",
  SUSPENDED: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};
const STATUS_LABEL: Record<Status, string> = { ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended" };

/** The record the whole school's sign-in, branding and report cards read: the first active one. */
const brandSchoolId = (schools: School[]): number | null =>
  [...schools].sort((a, b) => a.school_id - b.school_id).find((s) => s.status === "ACTIVE")?.school_id ?? null;

const logoUrl = (school: School, slot: SchoolLogoSlot = "primary") => {
  const col = slot === "primary" ? school.logo : slot === "partner" ? school.partner_logo : school.documents_logo;
  return col ? getSchoolLogoUrl(school.school_id, slot, school.logo_version) : null;
};

const SchoolCard = ({
  school,
  isBrand,
  onEdit,
  onConfig,
  onToggleActive,
  busy,
}: {
  school: School;
  isBrand: boolean;
  onEdit: (s: School) => void;
  onConfig: (s: School) => void;
  onToggleActive: (s: School) => void;
  busy: boolean;
}) => {
  const active = school.status === "ACTIVE";
  const iconBtn =
    "p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="flex flex-col bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-200 dark:border-slate-700/40 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
    >
      <div className="p-5 flex-1">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 flex items-center justify-center p-1.5 shrink-0">
            <TenantLogo src={logoUrl(school)} name={school.name} isPrimary={false} className="w-full h-full" rounded="rounded-xl" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight mb-1 break-words">{school.name}</h3>
            {school.school_code && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Code: {school.school_code}</p>}
            <div className="flex flex-wrap gap-1.5">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[school.status]}`}>
                {STATUS_LABEL[school.status]}
              </span>
              {isBrand && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  title="Its name and logo are what everyone signed in to this school sees"
                >
                  <Star className="w-3 h-3" /> In use
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="space-y-2.5">
          {[
            { icon: MapPin, value: [school.address, school.district].filter(Boolean).join(", "), label: "Address" },
            { icon: Mail, value: school.contact_email, label: "Email" },
            { icon: Phone, value: school.contact_phone, label: "Phone" },
          ]
            .filter((r) => r.value)
            .map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                <dt className="p-1.5 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-gray-400">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                </dt>
                <dd className="truncate" title={value || undefined}>
                  {value}
                </dd>
              </div>
            ))}
        </dl>
      </div>

      <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-gray-100 dark:border-slate-700/40">
        <button type="button" onClick={() => onConfig(school)} className={iconBtn} title="Apps and role access" aria-label={`Apps and role access for ${school.name}`}>
          <Settings className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => onEdit(school)} className={iconBtn} title="Edit" aria-label={`Edit ${school.name}`}>
          <Edit className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onToggleActive(school)}
          disabled={busy}
          className={active ? `${iconBtn} hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/20` : iconBtn}
          title={active ? "Deactivate" : "Reactivate"}
          aria-label={`${active ? "Deactivate" : "Reactivate"} ${school.name}`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : active ? <Power className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
        </button>
      </div>
    </motion.div>
  );
};

const SchoolCardSkeleton = () => (
  <div className="rounded-2xl border border-gray-200 dark:border-slate-700/40 bg-white dark:bg-slate-800/50 p-5 space-y-4 animate-pulse" aria-hidden="true">
    <div className="flex gap-4">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-100 dark:bg-slate-700" />
        <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-slate-700" />
        <div className="h-4 w-16 rounded-full bg-gray-100 dark:bg-slate-700" />
      </div>
    </div>
    <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-slate-700" />
    <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-slate-700" />
  </div>
);

// Configuration Modal (Systems & Roles)
const SchoolConfigurationModal = ({
  isOpen,
  onClose,
  school,
}: {
  isOpen: boolean;
  onClose: () => void;
  school: School;
}) => {
  const [activeTab, setActiveTab] = useState<"systems" | "roles">("systems");
  const [allSystems, setAllSystems] = useState<System[]>([]);
  const [schoolSystems, setSchoolSystems] = useState<System[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);

  // Role assignment state
  const [selectedSystemId, setSelectedSystemId] = useState<number | "">("");
  const [selectedRoleId, setSelectedRoleId] = useState<number | "">("");

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null); // system_id for toggles
  // Only the apps the school's package includes can be given to roles (tenant management §4).
  const tenantStatus = useTenantStatus();
  const roleSystems = schoolSystems.filter((sys) => isSystemEntitled(sys.client_id, tenantStatus.data?.entitlements));
  const { showToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (isOpen && school) {
      fetchData();
    }
  }, [isOpen, school]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [systemsData, schoolSystemsData, rolesData, assignmentsData] =
        await Promise.all([
          getSystems(),
          getSchoolSystems(school.school_id),
          getRoles(),
          getSchoolRoleAssignments(school.school_id),
        ]);

      if (systemsData) setAllSystems(systemsData);
      if (schoolSystemsData) setSchoolSystems(schoolSystemsData);
      if (rolesData) setRoles(rolesData);
      if (assignmentsData) setRoleAssignments(assignmentsData);
    } catch (error) {
      console.error("Failed to load configuration data", error);
      showToast("Failed to load configuration data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSystem = async (system: System, isAssigned: boolean) => {
    if (isAssigned) {
      const granted = roleAssignments.filter((r) => r.system_id === system.system_id).length;
      const ok = await confirm({
        title: `Turn off ${system.name}?`,
        message: granted
          ? `${granted} role grant${granted === 1 ? "" : "s"} for ${system.name} stop working until it is turned on again.`
          : `Nobody in ${school.name} can open ${system.name} until it is turned on again.`,
        confirmText: "Turn off",
        tone: "warning",
      });
      if (!ok) return;
    }
    setActionLoading(system.system_id);
    try {
      if (isAssigned) {
        // Remove
        await removeSystemFromSchool(school.school_id, system.system_id);
        setSchoolSystems((prev) =>
          prev.filter((s) => s.system_id !== system.system_id),
        );
        showToast(`Removed ${system.name} from school`, "success");
      } else {
        // Assign
        await assignSystemToSchool(school.school_id, system.system_id);
        setSchoolSystems((prev) => [...prev, system]);
        showToast(`Assigned ${system.name} to school`, "success");
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to update system assignment",
        "error",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveRoleAssignment = async (assignment: RoleAssignment) => {
    const ok = await confirm({
      title: `Revoke ${assignment.system_name} from ${assignment.role_name}?`,
      message: `People with the ${assignment.role_name} role lose access to ${assignment.system_name} in ${school.name}.`,
      confirmText: "Revoke",
      tone: "danger",
    });
    if (!ok) return;
    setActionLoading(assignment.fragment_id);
    try {
      await removeSystemFromRoleInSchool(
        school.school_id,
        assignment.role_id,
        assignment.system_id,
      );
      setRoleAssignments((prev) =>
        prev.filter((r) => r.fragment_id !== assignment.fragment_id),
      );
      showToast("Access revoked successfully", "success");
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to revoke access", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedSystemId || !selectedRoleId) return;
    if (roleAssignments.some((r) => r.role_id === Number(selectedRoleId) && r.system_id === Number(selectedSystemId))) {
      showToast("That role already has this app", "info");
      return;
    }
    setActionLoading(-1); // Use -1 for generic loading
    try {
      await assignSystemToRoleInSchool(
        school.school_id,
        Number(selectedRoleId),
        Number(selectedSystemId),
      );
      showToast("System assigned to role successfully", "success");

      // Refresh list
      const updated = await getSchoolRoleAssignments(school.school_id);
      if (updated) setRoleAssignments(updated);

      setSelectedSystemId("");
      setSelectedRoleId("");
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to assign role",
        "error",
      );
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      contentClassName="p-6 overflow-y-auto custom-scrollbar grow"
      title={
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
            <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Configure {school.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-normal">
              Manage systems and role-based access
            </p>
          </div>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200 dark:border-slate-700/30">
        <button
          onClick={() => setActiveTab("systems")}
          className={`pb-3 px-2 text-sm font-medium transition-colors relative ${
            activeTab === "systems"
              ? "text-blue-600 dark:text-blue-400"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            System Assignments
          </div>
          {activeTab === "systems" && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`pb-3 px-2 text-sm font-medium transition-colors relative ${
            activeTab === "roles"
              ? "text-blue-600 dark:text-blue-400"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Role Access
          </div>
          {activeTab === "roles" && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
            />
          )}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading configuration">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] rounded-3xl bg-gray-100 dark:bg-slate-700/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {activeTab === "systems" ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Enable or disable modules for this tenant. Enabled modules will
                be available for role assignment.
              </p>
              <div className="grid grid-cols-1 gap-4">
                {allSystems.map((system) => {
                  const isAssigned = schoolSystems.some(
                    (s) => s.system_id === system.system_id,
                  );
                  const isLoading = actionLoading === system.system_id;
                  const locked = !isAssigned && !isSystemEntitled(system.client_id, tenantStatus.data?.entitlements);

                  return (
                    <div
                      key={system.system_id}
                      className={`flex items-center justify-between p-4 rounded-3xl border transition-all ${
                        isAssigned
                          ? "bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800"
                          : "bg-gray-50 border-gray-100 dark:bg-slate-700/30 dark:border-slate-700/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${
                            isAssigned
                              ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-gray-200 text-gray-500 dark:bg-slate-600 dark:text-gray-400"
                          }`}
                        >
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {system.name}
                          </h4>
                          <p className="text-xs text-gray-500 max-w-[250px] truncate">
                            {locked ? "Not in this school's package" : system.description}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={isAssigned}
                        aria-label={`${system.name} for ${school.name}`}
                        onClick={() => handleToggleSystem(system, isAssigned)}
                        disabled={isLoading || locked}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isAssigned
                            ? "bg-blue-600"
                            : "bg-gray-200 dark:bg-slate-600"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isAssigned ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <div className="flex gap-3">
                  <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-200 text-sm">
                      Grant Role Permissions
                    </h4>
                    <p className="text-blue-700 dark:text-blue-300/70 text-sm mt-1">
                      Assign enabled systems to specific roles within{" "}
                      {school.name}.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 flex flex-row items-end justify-center gap-3">
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Select Enabled Module
                  </label>
                  <div className="relative">
                    <SelectField
                      value={selectedSystemId}
                      onChange={(e) =>
                        setSelectedSystemId(Number(e.target.value))
                      }
                      className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white appearance-none transition-all"
                    >
                      <option value="">Choose a module...</option>
                      {roleSystems.map((sys) => (
                        <option key={sys.system_id} value={sys.system_id}>
                          {sys.name}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  {schoolSystems.length === 0 && (
                    <p className="text-xs text-red-500 mt-1 ml-1">
                      * No modules enabled for this school yet. Go to 'System
                      Assignments' tab first.
                    </p>
                  )}
                </div>

                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Select Role
                  </label>
                  <div className="relative">
                    <SelectField
                      value={selectedRoleId}
                      onChange={(e) =>
                        setSelectedRoleId(Number(e.target.value))
                      }
                      className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white appearance-none transition-all"
                    >
                      <option value="">Choose a role...</option>
                      {roles.map((role) => (
                        <option key={role.role_id} value={role.role_id}>
                          {role.name}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>

                <button
                  onClick={handleAssignRole}
                  disabled={
                    actionLoading === -1 || !selectedSystemId || !selectedRoleId
                  }
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition-all disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                >
                  {actionLoading === -1 ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Grant Access
                    </>
                  )}
                </button>
              </div>

              {/* Active Assignments List */}
              {roleAssignments.length > 0 && (
                <div className="pt-6 border-t border-gray-100 dark:border-slate-700/30">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">
                    Active Assignments
                  </h4>
                  <div className="space-y-2">
                    {roleAssignments.map((assignment) => (
                      <div
                        key={assignment.fragment_id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg border border-gray-100 dark:border-slate-700/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md text-blue-600 dark:text-blue-400">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white text-sm">
                              {assignment.role_name}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <span>Has access to:</span>
                              <span className="font-medium text-blue-500">
                                {assignment.system_name}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveRoleAssignment(assignment)}
                          disabled={actionLoading === assignment.fragment_id}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                          title="Revoke Access"
                          aria-label={`Revoke ${assignment.system_name} from ${assignment.role_name}`}
                        >
                          {actionLoading === assignment.fragment_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!loading && (
        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700/30 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Close Configuration
          </button>
        </div>
      )}
    </Modal>
  );
};

const EMPTY: Partial<School> = {
  name: "",
  school_code: "",
  address: "",
  contact_email: "",
  contact_phone: "",
  sector: "",
  trade: "",
  qualification_title: "",
  district: "",
  head_teacher_name: "",
  status: "ACTIVE",
};

const LOGO_SLOTS: { slot: SchoolLogoSlot; title: string; hint: string }[] = [
  { slot: "primary", title: "Logo", hint: "App, sign-in page, cover page (left)" },
  { slot: "partner", title: "Partner logo", hint: "Cover page (right)" },
  { slot: "documents", title: "Documents logo", hint: "Report and PDF header" },
];

const inputCls = (error?: string) =>
  `w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400 ${
    error ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-slate-700/30"
  }`;

const Field = ({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <div className={className}>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1 ml-1">
        {error}
      </p>
    ) : hint ? (
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-1">{hint}</p>
    ) : null}
  </div>
);

// Create / edit a school record. Logos are uploaded on their own (never sent with Save).
const SchoolModal = ({
  isOpen,
  onClose,
  onSaved,
  school,
  isBrand,
  isLastActive,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (school: School | null, created: boolean) => void;
  school?: School | null;
  isBrand: boolean;
  isLastActive: boolean;
}) => {
  const [formData, setFormData] = useState<Partial<School>>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<SchoolTextField | "status", string>>>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState<SchoolLogoSlot | null>(null);
  const [current, setCurrent] = useState<School | null>(null);
  const { showToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (!isOpen) return;
    setFormData(school ? { ...EMPTY, ...school } : EMPTY);
    setCurrent(school ?? null);
    setErrors({});
    setTouched(false);
  }, [school, isOpen]);

  const set = (field: SchoolTextField | "status", value: string) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    if (touched) setErrors(validateSchool(next));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const found = validateSchool(formData);
    setErrors(found);
    if (Object.keys(found).length) {
      showToast("Check the highlighted fields", "error");
      return;
    }
    if (current && current.status === "ACTIVE" && formData.status !== "ACTIVE") {
      const ok = await confirm({
        title: `Make ${current.name} ${STATUS_LABEL[formData.status as Status].toLowerCase()}?`,
        message: "Its users lose access until it is active again. Nothing is deleted.",
        confirmText: "Save",
        tone: "warning",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const payload = schoolPayload(formData);
      if (current) {
        await updateSchool(current.school_id, payload);
        showToast("School saved", "success");
        onSaved(null, false);
        if (isBrand && payload.name !== current.name) refreshBranding();
        onClose();
      } else {
        const created = await createSchool(payload);
        showToast(created ? "School created. You can add its logos now." : "School created", "success");
        onSaved(created, true);
        if (created) {
          // Stay open on the new record so its logos can be uploaded straight away.
          setCurrent(created);
          setFormData({ ...EMPTY, ...created });
        } else onClose();
      }
    } catch (error: any) {
      const data = error.response?.data;
      if (data?.field) setErrors((prev) => ({ ...prev, [data.field]: data.message }));
      showToast(data?.message || "Failed to save school", "error");
    } finally {
      setSaving(false);
    }
  };

  const afterLogo = (fresh: School | null, message: string) => {
    if (fresh) setCurrent(fresh);
    onSaved(null, false);
    if (isBrand) refreshBranding();
    showToast(message, "success");
  };

  const handleLogoFile = async (slot: SchoolLogoSlot, input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // the same file can be chosen again
    if (!file || !current) return;
    if (!/\.(png|jpe?g|svg|webp)$/i.test(file.name)) return showToast("Choose a PNG, JPG, WEBP or SVG image", "error");
    if (file.size > LOGO_MAX_BYTES) return showToast("The image is larger than 5 MB", "error");
    setLogoBusy(slot);
    try {
      const fresh = await uploadSchoolLogo(current.school_id, file, slot);
      afterLogo(fresh, `${LOGO_SLOTS.find((l) => l.slot === slot)!.title} uploaded`);
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to upload logo", "error");
    } finally {
      setLogoBusy(null);
    }
  };

  const handleLogoRemove = async (slot: SchoolLogoSlot) => {
    if (!current) return;
    const title = LOGO_SLOTS.find((l) => l.slot === slot)!.title;
    const ok = await confirm({
      title: `Remove the ${title.toLowerCase()}?`,
      message: slot === "primary" && isBrand ? "The app shows the default mark until a new logo is uploaded." : "You can upload another one at any time.",
      confirmText: "Remove",
      tone: "warning",
    });
    if (!ok) return;
    setLogoBusy(slot);
    try {
      afterLogo(await removeSchoolLogo(current.school_id, slot), `${title} removed`);
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to remove logo", "error");
    } finally {
      setLogoBusy(null);
    }
  };

  const text = (field: SchoolTextField, opts: { label: string; placeholder?: string; hint?: string; required?: boolean; type?: string; className?: string }) => (
    <Field id={`school-${field}`} label={opts.label} required={opts.required} error={errors[field]} hint={opts.hint} className={opts.className}>
      <input
        id={`school-${field}`}
        type={opts.type ?? "text"}
        value={String(formData[field] ?? "")}
        maxLength={SCHOOL_LIMITS[field]}
        onChange={(e) => set(field, e.target.value)}
        aria-invalid={!!errors[field]}
        aria-describedby={errors[field] ? `school-${field}-error` : undefined}
        className={inputCls(errors[field])}
        placeholder={opts.placeholder}
      />
    </Field>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      contentClassName="p-5 sm:p-8"
      title={
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
            <Building className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{current ? "Edit school" : "New school"}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-normal">
              {current ? "Identity, logos and contacts" : "Add a school record to this account"}
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <section aria-labelledby="school-logos">
          <h3 id="school-logos" className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Logos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {LOGO_SLOTS.map(({ slot, title, hint }) => {
              const url = current ? logoUrl(current, slot) : null;
              const busy = logoBusy === slot;
              return (
                <div key={slot} className="p-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0 p-1">
                      {busy ? (
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      ) : url ? (
                        <TenantLogo src={url} name={`${title} of ${current!.name}`} isPrimary={false} className="w-full h-full" rounded="rounded" />
                      ) : (
                        <Building className="w-6 h-6 text-gray-300" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{hint}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${
                        current && !logoBusy
                          ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40"
                          : "text-gray-400 bg-gray-100 dark:bg-slate-800 cursor-not-allowed"
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      {!current ? "Save first" : url ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        disabled={!current || logoBusy !== null}
                        onChange={(e) => handleLogoFile(slot, e.currentTarget)}
                        className="sr-only"
                        aria-label={`Upload ${title.toLowerCase()}`}
                      />
                    </label>
                    {url && (
                      <button
                        type="button"
                        onClick={() => handleLogoRemove(slot)}
                        disabled={logoBusy !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                        aria-label={`Remove ${title.toLowerCase()}`}
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">PNG, JPG, WEBP or SVG, up to 5 MB. A square image looks best in the app.</p>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {text("name", { label: "School name", required: true, placeholder: "e.g. Green Valley High", className: "sm:col-span-2" })}
          {text("school_code", { label: "School code", placeholder: "e.g. 120823", hint: "Prefix of student registration numbers (120823-0001)." })}
          {text("sector", { label: "Sector", placeholder: "e.g. ICT and Multimedia" })}
          {text("trade", { label: "Trade", placeholder: "e.g. Software Programming and Embedded Systems" })}
          {text("qualification_title", {
            label: "Qualification title",
            placeholder: "e.g. TVET Certificate 3 in Software Programming",
            hint: "Sector, trade and qualification print on every Scheme of Work cover.",
            className: "sm:col-span-2 lg:col-span-1",
          })}
          {text("district", { label: "District", placeholder: "e.g. Gasabo" })}
          {text("head_teacher_name", {
            label: "Head of school's name",
            placeholder: "Printed above the signature on report cards",
            className: "sm:col-span-2",
          })}
          {text("contact_email", { label: "Contact email", type: "email", placeholder: "admin@school.rw" })}
          {text("contact_phone", { label: "Contact phone", type: "tel", placeholder: "+250 788 000 000" })}
          <Field id="school-address" label="Address" error={errors.address} className="sm:col-span-2 lg:col-span-3">
            <textarea
              id="school-address"
              value={formData.address || ""}
              maxLength={SCHOOL_LIMITS.address}
              onChange={(e) => set("address", e.target.value)}
              rows={2}
              aria-invalid={!!errors.address}
              className={`${inputCls(errors.address)} resize-none`}
              placeholder="e.g. KG 7 Ave, Kimihurura"
            />
          </Field>

          <fieldset className="sm:col-span-2 lg:col-span-3">
            <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Status</legend>
            <div className="flex flex-wrap gap-3">
              {(["ACTIVE", "INACTIVE", "SUSPENDED"] as Status[]).map((status) => {
                const blocked = status !== "ACTIVE" && !!current && current.status === "ACTIVE" && isLastActive;
                return (
                  <label key={status} className={`relative flex items-center ${blocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                    <input
                      type="radio"
                      name="status"
                      value={status}
                      disabled={blocked}
                      checked={formData.status === status}
                      onChange={(e) => set("status", e.target.value)}
                      className="sr-only peer"
                    />
                    <span className="px-4 py-2 rounded-full border border-gray-200 dark:border-slate-700/30 text-sm font-medium text-gray-500 peer-checked:bg-blue-50 peer-checked:border-blue-500 peer-checked:text-blue-600 dark:peer-checked:bg-blue-900/40 dark:peer-checked:text-blue-400 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 transition-all">
                      {STATUS_LABEL[status]}
                    </span>
                  </label>
                );
              })}
            </div>
            {current?.status === "ACTIVE" && isLastActive && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">
                This is the only active school record, so it stays active: sign-in, branding and report cards depend on it.
              </p>
            )}
            {errors.status && <p className="text-xs text-red-600 mt-1 ml-1">{errors.status}</p>}
          </fieldset>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            {current && !school ? "Done" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving..." : current ? "Save changes" : "Create school"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const FILTERS: Array<{ key: "ALL" | Status; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "INACTIVE", label: "Inactive" },
  { key: "SUSPENDED", label: "Suspended" },
];

const Schools = () => {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { hasPermission } = usePermissions();
  const access = useAccess();

  const canManage = access.can("MANAGE_SCHOOLS") || hasPermission("MANAGE_SCHOOLS");
  const canPlatform = access.can(["PLATFORM_TENANTS_VIEW", "PLATFORM_VIEW"]);

  const fetchSchools = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await getSchools();
      if (data) setSchools(data);
      setLoadError(null);
    } catch (error: any) {
      const message = error.response?.data?.message || "Couldn't load the schools";
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) void fetchSchools();
  }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const brandId = useMemo(() => brandSchoolId(schools), [schools]);
  const activeCount = schools.filter((s) => s.status === "ACTIVE").length;

  const handleToggleActive = async (school: School) => {
    const activating = school.status !== "ACTIVE";
    if (!activating && activeCount <= 1) {
      showToast("This is the only active school record. Activate or add another one first.", "error");
      return;
    }
    const ok = await confirm(
      activating
        ? { title: `Reactivate ${school.name}?`, message: "Its users can sign in again.", confirmText: "Reactivate", tone: "info" }
        : {
            title: `Deactivate ${school.name}?`,
            message: "Its users lose access until it is reactivated. Nothing is deleted.",
            confirmText: "Deactivate",
            tone: "warning",
          },
    );
    if (!ok) return;
    setBusyId(school.school_id);
    try {
      if (activating) await updateSchool(school.school_id, { status: "ACTIVE" });
      else await deleteSchool(school.school_id);
      showToast(activating ? `${school.name} is active again` : `${school.name} deactivated`, "success");
      await fetchSchools(true);
      refreshBranding();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Couldn't change the school's status", "error");
    } finally {
      setBusyId(null);
    }
  };

  const q = searchTerm.trim().toLowerCase();
  const filteredSchools = schools.filter(
    (s) =>
      (filter === "ALL" || s.status === filter) &&
      (!q || [s.name, s.school_code, s.contact_email, s.address, s.district].some((v) => v?.toLowerCase().includes(q))),
  );
  const countOf = (key: "ALL" | Status) => (key === "ALL" ? schools.length : schools.filter((s) => s.status === key).length);

  if (!canManage) {
    if (access.loading) {
      return (
        <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <SchoolCardSkeleton />
          <SchoolCardSkeleton />
        </div>
      );
    }
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 mb-4">
          <SchoolIcon className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access denied</h2>
        <p className="text-gray-500 max-w-sm">You need the Manage schools permission to change school records.</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen p-4 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              Tenants & Schools
              <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-md border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                Admin
              </span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-base">
              This school's identity, logos and apps. The logo marked <span className="font-medium">In use</span> is the one everyone signed in here sees.
            </p>
            {canPlatform && (
              <Link to="/platform/schools" className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Other schools on the platform are managed in the platform console <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedSchool(null);
              setModalOpen(true);
            }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center gap-2 font-semibold transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add school
          </button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative w-full lg:max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="search"
              aria-label="Search schools"
              className="block w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-slate-700/30 rounded-xl bg-white dark:bg-slate-800/50 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm transition-all"
              placeholder="Search by name, code, email or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                  filter === f.key
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-200 dark:border-slate-700/40 text-gray-600 dark:text-gray-300 hover:border-blue-300"
                }`}
              >
                {f.label} <span className="opacity-70">{countOf(f.key)}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6" aria-busy="true" aria-label="Loading schools">
            {[0, 1, 2].map((i) => (
              <SchoolCardSkeleton key={i} />
            ))}
          </div>
        ) : loadError && !schools.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{loadError}</h3>
            <button type="button" onClick={() => fetchSchools()} className="mt-2 px-5 py-2 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
              Try again
            </button>
          </div>
        ) : filteredSchools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {filteredSchools.map((school) => (
                <SchoolCard
                  key={school.school_id}
                  school={school}
                  isBrand={school.school_id === brandId}
                  busy={busyId === school.school_id}
                  onEdit={(s) => {
                    setSelectedSchool(s);
                    setModalOpen(true);
                  }}
                  onConfig={(s) => {
                    setSelectedSchool(s);
                    setConfigModalOpen(true);
                  }}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-gray-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-5">
              <Search className="w-9 h-9 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{schools.length ? "No schools match" : "No schools yet"}</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm">
              {schools.length ? "Try another search or status." : "Add the school's record to set its name, logo and apps."}
            </p>
          </div>
        )}
      </div>

      <SchoolModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => void fetchSchools(true)}
        school={selectedSchool}
        isBrand={!!selectedSchool && selectedSchool.school_id === brandId}
        isLastActive={activeCount <= 1}
      />

      {selectedSchool && (
        <SchoolConfigurationModal isOpen={configModalOpen} onClose={() => setConfigModalOpen(false)} school={selectedSchool} />
      )}
    </>
  );
};

export default Schools;
