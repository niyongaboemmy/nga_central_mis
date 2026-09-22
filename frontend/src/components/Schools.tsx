import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  School as SchoolIcon,
  Plus,
  Search,
  Edit,
  Trash2,
  MapPin,
  Mail,
  Phone,
  Settings,
  Layers,
  Shield,
  Check,
  Building,
  ChevronRight,
  Loader2,
} from "lucide-react";
import Modal from "./ui/Modal";
import { useToast } from "../contexts/ToastContext";
import { useUser } from "../contexts/UserContext";
import {
  getSchools,
  createSchool,
  updateSchool,
  deleteSchool,
  uploadSchoolLogo,
  getSchoolLogoUrl,
  School,
  SchoolLogoSlot,
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

// Modern School Card Component
const SchoolCard = ({
  school,
  onEdit,
  onConfig,
  onDelete,
}: {
  school: School;
  onEdit: (s: School) => void;
  onConfig: (s: School) => void;
  onDelete: (id: number) => void;
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className="group relative bg-white dark:bg-slate-800/50 rounded-2xl shadow-sm hover:shadow-xl border border-gray-100 dark:border-slate-700/30 overflow-hidden transition-all duration-300"
    >
      <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
        <button
          onClick={() => onConfig(school)}
          className="p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm text-blue-500 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 shadow-sm"
          title="Configure Systems & Roles"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          onClick={() => onEdit(school)}
          className="p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm text-blue-500 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 shadow-sm"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(school.school_id)}
          className="p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm text-red-500 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 shadow-sm"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-500 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 text-white text-xl font-bold">
            {school.logo ? (
              <img
                src={getSchoolLogoUrl(school.school_id, "primary")}
                alt={school.name}
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              school.name.substring(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight mb-1">
              {school.name}
            </h3>
            {school.school_code && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                Code: {school.school_code}
              </p>
            )}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                school.status === "ACTIVE"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {school.status}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {school.address && (
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-gray-400 group-hover:text-blue-500 transition-colors">
                <MapPin className="w-4 h-4" />
              </div>
              <span className="truncate">{school.address}</span>
            </div>
          )}
          {school.contact_email && (
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-gray-400 group-hover:text-blue-500 transition-colors">
                <Mail className="w-4 h-4" />
              </div>
              <span className="truncate">{school.contact_email}</span>
            </div>
          )}
          {school.contact_phone && (
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-gray-400 group-hover:text-blue-500 transition-colors">
                <Phone className="w-4 h-4" />
              </div>
              <span className="truncate">{school.contact_phone}</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
    </motion.div>
  );
};

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
  const { showToast } = useToast();

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
      showToast("Failed to revoke access", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedSystemId || !selectedRoleId) return;
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
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
                            {system.description}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleSystem(system, isAssigned)}
                        disabled={isLoading}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
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
                    <select
                      value={selectedSystemId}
                      onChange={(e) =>
                        setSelectedSystemId(Number(e.target.value))
                      }
                      className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white appearance-none transition-all"
                    >
                      <option value="">Choose a module...</option>
                      {schoolSystems.map((sys) => (
                        <option key={sys.system_id} value={sys.system_id}>
                          {sys.name}
                        </option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
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
                    <select
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
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
                  </div>
                </div>

                <button
                  onClick={handleAssignRole}
                  disabled={
                    actionLoading === -1 || !selectedSystemId || !selectedRoleId
                  }
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none mt-4 flex items-center justify-center gap-2"
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

// Modal for Create/Update
const SchoolModal = ({
  isOpen,
  onClose,
  onSuccess,
  school,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  school?: School | null;
}) => {
  const [formData, setFormData] = useState<Partial<School>>({
    name: "",
    school_code: "",
    address: "",
    contact_email: "",
    contact_phone: "",
    logo: "",
    sector: "",
    trade: "",
    qualification_title: "",
    status: "ACTIVE",
  });
  const [loading, setLoading] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<SchoolLogoSlot | null>(null);
  // Bumps whenever a logo is (re)uploaded so the <img> cache-busts instead of showing the old
  // file at the same URL.
  const [logoVersion, setLogoVersion] = useState(0);
  const { showToast } = useToast();

  useEffect(() => {
    if (school) {
      setFormData(school);
    } else {
      setFormData({
        name: "",
        school_code: "",
        address: "",
        contact_email: "",
        contact_phone: "",
        logo: "",
        sector: "",
        trade: "",
        qualification_title: "",
        status: "ACTIVE",
      });
    }
    setLogoVersion(0);
  }, [school, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (school) {
        await updateSchool(school.school_id, formData);
        showToast("School updated successfully", "success");
      } else {
        await createSchool(formData);
        showToast("School created successfully", "success");
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to save school",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const LOGO_SLOT_LABELS: Record<SchoolLogoSlot, string> = {
    primary: "Logo",
    partner: "Partner logo",
    documents: "Documents logo",
  };

  const LOGO_SLOT_CONFIG: {
    slot: SchoolLogoSlot;
    title: string;
    hint: string;
    field: "logo" | "partner_logo" | "documents_logo";
  }[] = [
    { slot: "primary", title: "Logo", hint: "(cover page, left)", field: "logo" },
    { slot: "partner", title: "Partner Logo", hint: "(cover page, right)", field: "partner_logo" },
    {
      slot: "documents",
      title: "Documents Logo",
      hint: "(reports & PDF header)",
      field: "documents_logo",
    },
  ];

  const handleLogoFile = async (slot: SchoolLogoSlot, file: File | null) => {
    if (!file || !school) return;
    setUploadingSlot(slot);
    try {
      await uploadSchoolLogo(school.school_id, file, slot);
      const field = LOGO_SLOT_CONFIG.find((c) => c.slot === slot)!.field;
      // formData[field] is what gates showing the <img> below vs. the placeholder icon --
      // it was never set after a fresh upload (only logoVersion was bumped), so a school that
      // didn't already have this slot filled in kept showing the empty-state icon until the
      // whole modal was reopened. The actual image bytes come from getSchoolLogoUrl/logoVersion,
      // not this value, so any truthy placeholder is enough to flip the gate.
      setFormData((prev) => ({ ...prev, [field]: "uploaded" }));
      setLogoVersion((v) => v + 1);
      showToast(`${LOGO_SLOT_LABELS[slot]} uploaded`, "success");
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to upload logo",
        "error",
      );
    } finally {
      setUploadingSlot(null);
    }
  };

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
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {school ? "Edit School" : "New School"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-normal">
              {school ? "Update tenant details" : "Onboard a new tenant"}
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
              School Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
              placeholder="e.g. Green Valley High"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
              School Code
            </label>
            <input
              type="text"
              value={formData.school_code || ""}
              onChange={(e) =>
                setFormData({ ...formData, school_code: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
              placeholder="e.g. 120823"
            />
            <p className="text-xs text-gray-400 mt-1 ml-1">
              Used as the prefix for student registration numbers (e.g.
              120823-0001).
            </p>
          </div>

          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-5">
            {LOGO_SLOT_CONFIG.map(({ slot, title, hint, field }) => (
              <div key={slot}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                  {title}
                  <span className="text-gray-400 font-normal ml-1">{hint}</span>
                </label>
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl">
                  <div className="w-14 h-14 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                    {school && formData[field] ? (
                      <img
                        src={getSchoolLogoUrl(school.school_id, slot, logoVersion || undefined)}
                        alt={`${slot} logo`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Building className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  <label className="flex-1 min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-full cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                      {uploadingSlot === slot ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : null}
                      {!school
                        ? "Save school first"
                        : uploadingSlot === slot
                          ? "Uploading..."
                          : "Upload image"}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      disabled={!school || uploadingSlot !== null}
                      onChange={(e) =>
                        handleLogoFile(slot, e.target.files?.[0] || null)
                      }
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
              Sector
            </label>
            <input
              type="text"
              value={formData.sector || ""}
              onChange={(e) =>
                setFormData({ ...formData, sector: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
              placeholder="e.g. ICT and Multimedia"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
              Trade
            </label>
            <input
              type="text"
              value={formData.trade || ""}
              onChange={(e) =>
                setFormData({ ...formData, trade: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
              placeholder="e.g. Software Programming and Embedded Systems"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
              Qualification Title
            </label>
            <input
              type="text"
              value={formData.qualification_title || ""}
              onChange={(e) =>
                setFormData({ ...formData, qualification_title: e.target.value })
              }
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
              placeholder="e.g. TVET Certificate 3 in Software Programming and Embedded Systems"
            />
            <p className="text-xs text-gray-400 mt-1 ml-1">
              Sector, Trade, and Qualification Title appear on every Scheme of Work's printed
              cover page.
            </p>
          </div>

          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Contact Email
              </label>
              <input
                type="email"
                value={formData.contact_email || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contact_email: e.target.value,
                  })
                }
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
                placeholder="admin@school.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Contact Phone
              </label>
              <input
                type="tel"
                value={formData.contact_phone || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contact_phone: e.target.value,
                  })
                }
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
                placeholder="+1 234..."
              />
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
              Address
            </label>
            <textarea
              value={formData.address || ""}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              rows={2}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400 resize-none"
              placeholder="123 Education St..."
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
              Status
            </label>
            <div className="flex gap-4">
              {["ACTIVE", "INACTIVE", "SUSPENDED"].map((status) => (
                <label
                  key={status}
                  className="relative flex items-center cursor-pointer group"
                >
                  <input
                    type="radio"
                    name="status"
                    value={status}
                    checked={formData.status === status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as any,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="px-4 py-2 rounded-full border border-gray-200 dark:border-slate-700/30 text-sm font-medium text-gray-500 peer-checked:bg-blue-50 peer-checked:border-blue-500 peer-checked:text-blue-600 dark:peer-checked:bg-blue-900/40 dark:peer-checked:text-blue-400 transition-all">
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 rounded-full shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              "Save Tenant"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const Schools = () => {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { user } = useUser();

  // Basic permission check - ideally use MANAGE_SCHOOLS check
  const canManage = user?.roles?.find((itm) =>
    itm.permissions?.find(
      (perm) =>
        perm.name.includes("MANAGE_SCHOOLS") || perm.name.includes("ADMIN"),
    ),
  );

  const fetchSchools = async () => {
    setLoading(true);
    try {
      const data = await getSchools();
      if (data) setSchools(data);
    } catch (error) {
      console.error("Failed to fetch schools", error);
      showToast("Failed to fetch schools", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  const handleEdit = (school: School) => {
    setSelectedSchool(school);
    setModalOpen(true);
  };

  const handleConfig = (school: School) => {
    setSelectedSchool(school);
    setConfigModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (
      !(await confirm({
        title: "Deactivate this school?",
        message: "Its users lose access until it is reactivated. Nothing is deleted.",
        confirmText: "Deactivate",
        tone: "warning",
      }))
    )
      return;
    try {
      await deleteSchool(id);
      showToast("School deactivated successfully", "success");
      fetchSchools();
    } catch (error) {
      console.error("Failed to delete school", error);
      showToast("Failed to delete school", "error");
    }
  };

  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (!canManage) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 mb-4">
          <SchoolIcon className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Access Denied
        </h2>
        <p className="text-gray-500 max-w-sm">
          You do not have permission to manage tenant configurations.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen p-4 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <span className="bg-gradient-to-br ">Tenants & Schools</span>
              <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-md border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                Admin
              </span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-base">
              Manage your multi-tenancy configurations and institutions
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedSchool(null);
              setModalOpen(true);
            }}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white rounded-full shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 font-semibold transition-all"
          >
            <Plus className="w-5 h-5" />
            Add Tenant
          </motion.button>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-slate-700/30 rounded-xl leading-5 bg-white dark:bg-slate-800/50 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm shadow-sm transition-all"
            placeholder="Search schools by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Grid Layout */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600" />
          </div>
        ) : (
          <>
            {filteredSchools.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence>
                  {filteredSchools.map((school) => (
                    <SchoolCard
                      key={school.school_id}
                      school={school}
                      onEdit={handleEdit}
                      onConfig={handleConfig}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-24 h-24 bg-gray-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
                  <Search className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  No schools found
                </h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                  We couldn't find any schools matching your search. Try adding
                  a new one.
                </p>
              </div>
            )}
          </>
        )}
      </div>
      {/* Modals */}
      <SchoolModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchSchools}
        school={selectedSchool}
      />

      {selectedSchool && (
        <SchoolConfigurationModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          school={selectedSchool}
        />
      )}
    </>
  );
};

export default Schools;
