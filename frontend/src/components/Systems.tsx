import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server as SystemIcon,
  Plus,
  Search,
  Edit,
  Trash2,
  Shield,
  School as SchoolIcon,
  // Check,
  Layers,
  ChevronRight,
  User,
  Building,
  Link,
  Copy,
} from "lucide-react";
import Modal from "./ui/Modal";
import { useToast } from "../contexts/ToastContext";
import { useUser } from "../contexts/UserContext";
import {
  getSystems,
  createSystem,
  updateSystem,
  deleteSystem,
  assignSystemToSchool,
  assignSystemToRoleInSchool,
  System,
} from "../api/systems";
import { getSchools, School } from "../api/schools";
import { getRoles, Role } from "../api/users";

// Modern System Card with Actions Overlay
const SystemCard = ({
  system,
  onEdit,
  // onAssign,
  onDelete,
}: {
  system: System;
  onEdit: (s: System) => void;
  onAssign: (s: System) => void;
  onDelete: (id: number) => void;
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative bg-white dark:bg-gray-900/60 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700/30 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
          <Layers className="w-6 h-6" />
        </div>
        <div className="flex gap-2">
          <span
            className={`px-2 py-1 rounded-md text-xs font-semibold ${
              system.status === "ACTIVE"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {system.status}
          </span>
        </div>
      </div>

      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
        {system.name}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 h-10 mb-6">
        {system.description || "No description provided."}
      </p>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-slate-700/30">
        {/* <button
          onClick={() => onAssign(system)}
          className="flex-1 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-semibold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          Assign
        </button> */}
        <div className="w-full"></div>
        <button
          onClick={() => onEdit(system)}
          className="px-3 py-2 bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-400 text-sm font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(system.system_id)}
          className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};

// Polished Modal for Create/Update
const SystemModal = ({
  isOpen,
  onClose,
  onSuccess,
  system,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  system?: System | null;
}) => {
  const [formData, setFormData] = useState<Partial<System>>({
    name: "",
    description: "",
    status: "ACTIVE",
    client_id: "",
    allowed_redirect_uris: "",
  });
  const [loading, setLoading] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (system) {
      setFormData(system);
      setCreatedSecret(null);
    } else {
      setFormData({
        name: "",
        description: "",
        status: "ACTIVE",
        client_id: "",
        allowed_redirect_uris: "",
      });
      setCreatedSecret(null);
    }
  }, [system, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (system) {
        await updateSystem(system.system_id, formData);
        showToast("System updated successfully", "success");
        onSuccess();
        onClose();
      } else {
        const response: any = await createSystem(formData);
        // If the backend returned a client_secret, display it
        if (response?.data?.client_secret) {
          setCreatedSecret(response.data.client_secret);
          showToast(
            "System created! Copy your Client Secret below.",
            "success",
          );
          onSuccess();
        } else {
          showToast("System created successfully", "success");
          onSuccess();
          onClose();
        }
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to save system",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!", "success");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      contentClassName="p-8"
      title={
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
            <SystemIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {system ? "Edit Module" : "New Module"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-normal">
              Configure system capabilities
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
            System Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
            placeholder="e.g. Finance Module"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
            Description
          </label>
          <textarea
            value={formData.description || ""}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            rows={3}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400 resize-none"
            placeholder="Describe what this module does..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
            Status
          </label>
          <div className="flex gap-2">
            {["ACTIVE", "DISABLED"].map((status) => (
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

        {/* SSO Configuration Section */}
        <div className="border-t border-gray-100 dark:border-slate-700/30 pt-5 mt-2">
          <div className="flex items-center gap-2 mb-4">
            <Link className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              SSO Configuration (Optional)
            </span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Client ID
              </label>
              <input
                type="text"
                value={formData.client_id || ""}
                onChange={(e) =>
                  setFormData({ ...formData, client_id: e.target.value })
                }
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400"
                placeholder="e.g. my_portal_app"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Allowed Redirect URIs (comma-separated)
              </label>
              <textarea
                value={formData.allowed_redirect_uris || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    allowed_redirect_uris: e.target.value,
                  })
                }
                rows={2}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-gray-400 resize-none"
                placeholder="https://app.example.com/callback, http://localhost:3000/callback"
              />
            </div>
          </div>
        </div>

        {/* Display generated secret after creation */}
        {createdSecret && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4">
            <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
              ⚠️ Copy your Client Secret now!
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg text-sm font-mono text-gray-800 dark:text-gray-200 overflow-x-auto">
                {createdSecret}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(createdSecret)}
                className="p-2 bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-200 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-700"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
              This secret will not be shown again.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-500 hover:from-blue-600 hover:to-blue-600 rounded-full shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? "Saving..." : "Save Module"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// Advanced Assignment Modal with Tabs
const AssignModal = ({
  isOpen,
  onClose,
  system,
}: {
  isOpen: boolean;
  onClose: () => void;
  system: System;
}) => {
  const [activeTab, setActiveTab] = useState<"school" | "role">("school");
  const [schools, setSchools] = useState<School[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [selectedSchoolId, setSelectedSchoolId] = useState<number | "">("");

  // For role assignment
  const [roleAssignSchoolId, setRoleAssignSchoolId] = useState<number | "">("");
  const [selectedRoleId, setSelectedRoleId] = useState<number | "">("");

  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    const schoolsData = await getSchools();
    if (schoolsData) setSchools(schoolsData);

    const rolesData = await getRoles();
    if (rolesData) setRoles(rolesData);
  };

  const handleAssignSchool = async () => {
    if (!selectedSchoolId) return;
    setLoading(true);
    try {
      await assignSystemToSchool(Number(selectedSchoolId), system.system_id);
      showToast("System assigned to school successfully", "success");
      onClose();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to assign system",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    if (!roleAssignSchoolId || !selectedRoleId) return;
    setLoading(true);
    try {
      await assignSystemToRoleInSchool(
        Number(roleAssignSchoolId),
        Number(selectedRoleId),
        system.system_id,
      );
      showToast("System assigned to role successfully", "success");
      onClose();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to assign system to role",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      contentClassName="p-6 md:p-8 overflow-y-auto custom-scrollbar"
      title={
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
            <Layers className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Assign Access
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-normal">
              Control visibility for{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                {system.name}
              </span>
            </p>
          </div>
        </div>
      }
    >
      {/* Custom Tabs */}
      <div className="flex p-1 bg-gray-100 dark:bg-slate-700/50 rounded-xl mb-6">
        <button
          onClick={() => setActiveTab("school")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === "school"
              ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <Building className="w-4 h-4" />
          To Tenant
        </button>
        <button
          onClick={() => setActiveTab("role")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === "role"
              ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <Shield className="w-4 h-4" />
          To Role
        </button>
      </div>

      <div className="min-h-[220px]">
        {activeTab === "school" ? (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
              <div className="flex gap-3">
                <div className="mt-0.5">
                  <SchoolIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-200 text-sm">
                    Tenant-wide Access
                  </h4>
                  <p className="text-blue-700 dark:text-blue-300/70 text-sm mt-1">
                    This will enable the module for the entire school ecosystem.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 ml-1">
                Select Tenant
              </label>
              <div className="relative">
                <select
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(Number(e.target.value))}
                  className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white appearance-none transition-all"
                >
                  <option value="">Choose a school...</option>
                  {schools.map((school) => (
                    <option key={school.school_id} value={school.school_id}>
                      {school.name}
                    </option>
                  ))}
                </select>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
              </div>
            </div>

            <button
              onClick={handleAssignSchool}
              disabled={loading || !selectedSchoolId}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? "Processing..." : "Grant Access"}
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-5"
          >
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800">
              <div className="flex gap-3">
                <div className="mt-0.5">
                  <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-purple-900 dark:text-purple-200 text-sm">
                    Role-base Access
                  </h4>
                  <p className="text-purple-700 dark:text-purple-300/70 text-sm mt-1">
                    Limit access to specific roles (e.g., Teachers) within a
                    tenant.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Select Tenant
              </label>
              <div className="relative">
                <select
                  value={roleAssignSchoolId}
                  onChange={(e) =>
                    setRoleAssignSchoolId(Number(e.target.value))
                  }
                  className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/30 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white appearance-none transition-all"
                >
                  <option value="">Choose a school...</option>
                  {schools.map((school) => (
                    <option key={school.school_id} value={school.school_id}>
                      {school.name}
                    </option>
                  ))}
                </select>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Select Role
              </label>
              <div className="relative">
                <select
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(Number(e.target.value))}
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
              disabled={loading || !roleAssignSchoolId || !selectedRoleId}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? "Processing..." : "Grant Role Access"}
            </button>
          </motion.div>
        )}
      </div>
    </Modal>
  );
};

// Main Page
const Systems = () => {
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<System | null>(null);
  const { showToast } = useToast();
  const { user } = useUser();

  const canManage = user?.roles?.find((itm) =>
    itm.permissions?.find(
      (perm) =>
        perm.name.includes("MANAGE_SYSTEMS") || perm.name.includes("ADMIN"),
    ),
  );

  const fetchSystems = async () => {
    setLoading(true);
    try {
      const data = await getSystems();
      if (data) setSystems(data);
    } catch (error) {
      console.error("Failed to fetch systems", error);
      showToast("Failed to fetch systems", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystems();
  }, []);

  const handleEdit = (system: System) => {
    setSelectedSystem(system);
    setModalOpen(true);
  };

  const handleAssign = (system: System) => {
    setSelectedSystem(system);
    setAssignModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this module?")) return;
    try {
      await deleteSystem(id);
      showToast("Module deleted successfully", "success");
      fetchSystems();
    } catch (error) {
      console.error("Failed to delete module", error);
      showToast("Failed to delete module", "error");
    }
  };

  const filteredSystems = systems.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (!canManage) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 mb-4">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Access Denied
        </h2>
        <p className="text-gray-500 max-w-sm">
          You do not have permission to manage system modules.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen p-3 md:p-6 md:pt-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <span className="">System Modules</span>
              <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-md border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                Core
              </span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-base">
              Manage available features and assign them to tenants
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedSystem(null);
              setModalOpen(true);
            }}
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-500 hover:from-blue-600 hover:to-blue-600 text-white rounded-full shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 font-semibold transition-all text-base"
          >
            <Plus className="w-5 h-5" />
            Add Module
          </motion.button>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-slate-700/30 rounded-2xl leading-5 bg-white dark:bg-gray-900/60 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm shadow-sm transition-all"
            placeholder="Search modules..."
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
            {filteredSystems.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence>
                  {filteredSystems.map((system) => (
                    <SystemCard
                      key={system.system_id}
                      system={system}
                      onEdit={handleEdit}
                      onAssign={handleAssign}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-24 h-24 bg-gray-50 dark:bg-gray-900/60 rounded-full flex items-center justify-center mb-6">
                  <Layers className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  No modules found
                </h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                  Create a module to start assigning features to your schools.
                </p>
              </div>
            )}
          </>
        )}
      </div>
      {/* Modals */}
      <SystemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchSystems}
        system={selectedSystem}
      />

      {selectedSystem && (
        <AssignModal
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          system={selectedSystem}
        />
      )}
    </>
  );
};

export default Systems;
