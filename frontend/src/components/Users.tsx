import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users as UsersIcon,
  User as UserIcon,
  Shield,
  Mail,
  Search,
  ChevronDown,
  CheckCircle,
  X,
  Upload,
  FileSpreadsheet,
  Plus,
  UserPlus,
  Loader2,
  AlertCircle,
  Phone,
  MapPin,
  Calendar,
  User,
  AtSign,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useUser } from "../contexts/UserContext";
import {
  getUsers,
  createUser,
  bulkCreateUsers,
  getRoles,
  UserWithProfile,
  UserRole,
  Role,
} from "../api/users";
import UserProfileModal from "./UserProfileModal";

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {[...Array(5)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: `${Math.random() * 100}%`,
          y: "100%",
        }}
        animate={{
          opacity: [0, 0.2, 0],
          y: "-10%",
        }}
        transition={{
          repeat: Infinity,
          duration: 15 + Math.random() * 15,
          delay: Math.random() * 15,
          ease: "linear",
        }}
        className="absolute"
        style={{ left: `${Math.random() * 100}%` }}
      >
        <div className="w-1.5 h-1.5 bg-blue-300/20 rounded-full" />
      </motion.div>
    ))}
  </div>
);

// Status badge with icon
const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    ACTIVE: {
      color:
        "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
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
      "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
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

// Form field with validation
interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => void;
  error?: string;
  required?: boolean;
  icon?: React.ElementType;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  required,
  icon: Icon,
  placeholder,
  options,
}) => {
  const id = `field-${name}`;
  const errorId = `error-${name}`;

  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-5 w-5 text-gray-400" />
          </div>
        )}
        {options ? (
          <select
            id={id}
            name={name}
            value={value}
            onChange={onChange}
            className={`w-full ${
              Icon ? "pl-10" : "pl-3"
            } pr-3 py-2.5 bg-gray-50 dark:bg-slate-700 border-2 rounded-xl text-sm focus:outline-none transition-all ${
              error
                ? "border-red-300 focus:border-red-500 dark:border-red-600"
                : "border-gray-200 dark:border-slate-600 focus:border-blue-500"
            } dark:text-white`}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className={`w-full ${
              Icon ? "pl-10" : "pl-3"
            } pr-3 py-2.5 bg-gray-50 dark:bg-slate-700 border-2 rounded-xl text-sm focus:outline-none transition-all ${
              error
                ? "border-red-300 focus:border-red-500 dark:border-red-600"
                : "border-gray-200 dark:border-slate-600 focus:border-blue-500"
            } dark:text-white`}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
          />
        )}
      </div>
      {error && (
        <motion.p
          id={errorId}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-red-500 flex items-center gap-1"
        >
          <AlertCircle className="w-3 h-3" />
          {error}
        </motion.p>
      )}
    </div>
  );
};

// Create User Modal
interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    phone_number: "",
    first_name: "",
    last_name: "",
    gender: "",
    date_of_birth: "",
    address: "",
  });

  // Validation functions
  const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateField = (name: string, value: string): string => {
    switch (name) {
      case "username":
        if (!value.trim()) return "Username is required";
        if (value.trim().length < 3)
          return "Username must be at least 3 characters";
        if (!/^[a-zA-Z0-9_]+$/.test(value))
          return "Username can only contain letters, numbers, and underscores";
        return "";
      case "email":
        if (!value.trim()) return "Email is required";
        if (!validateEmail(value)) return "Please enter a valid email address";
        return "";
      case "phone_number":
        if (value && !/^[0-9+\-\s]+$/.test(value))
          return "Please enter a valid phone number";
        return "";
      case "first_name":
        if (value && !/^[a-zA-Z\s]+$/.test(value))
          return "First name can only contain letters";
        return "";
      case "last_name":
        if (value && !/^[a-zA-Z\s]+$/.test(value))
          return "Last name can only contain letters";
        return "";
      default:
        return "";
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Real-time validation
    const error = validateField(name, value);
    setErrors((prev) => ({
      ...prev,
      [name]: error,
    }));
  };

  const toggleRole = (roleId: number) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    Object.keys(formData).forEach((key) => {
      const error = validateField(key, formData[key as keyof typeof formData]);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    });

    if (selectedRoles.length === 0) {
      newErrors.roles = "Please select at least one role";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      await createUser(
        {
          username: formData.username,
          email: formData.email,
          phone_number: formData.phone_number || undefined,
          status: "ACTIVE",
          roles: selectedRoles,
          first_name: formData.first_name || undefined,
          last_name: formData.last_name || undefined,
          gender: formData.gender || undefined,
          date_of_birth: formData.date_of_birth || undefined,
          address: formData.address || undefined,
        },
        () => {},
        (err) => {
          throw err;
        }
      );

      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || "Failed to create user";
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      username: "",
      email: "",
      phone_number: "",
      first_name: "",
      last_name: "",
      gender: "",
      date_of_birth: "",
      address: "",
    });
    setSelectedRoles([]);
    setErrors({});
  };

  useEffect(() => {
    if (isOpen) {
      loadRoles();
    }
  }, [isOpen]);

  const loadRoles = async () => {
    try {
      const data = await getRoles("ACTIVE");
      if (data) {
        setRoles(data);
      }
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-500 to-indigo-600">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <UserPlus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Create New User
                  </h2>
                  <p className="text-sm text-white/80">
                    Fill in the user details below
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Form Content */}
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <form onSubmit={handleSubmit} noValidate>
                <div className="space-y-5">
                  {/* Account Information */}
                  <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <AtSign className="w-4 h-4 text-blue-500" />
                      Account Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        label="Username"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        error={errors.username}
                        required
                        icon={User}
                        placeholder="Enter username"
                      />
                      <FormField
                        label="Email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        error={errors.email}
                        required
                        icon={Mail}
                        placeholder="Enter email"
                      />
                      <FormField
                        label="Phone Number"
                        name="phone_number"
                        type="tel"
                        value={formData.phone_number}
                        onChange={handleChange}
                        error={errors.phone_number}
                        icon={Phone}
                        placeholder="Enter phone number"
                      />
                    </div>
                  </div>

                  {/* Personal Information */}
                  <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <User className="w-4 h-4 text-emerald-500" />
                      Personal Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        label="First Name"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleChange}
                        error={errors.first_name}
                        icon={User}
                        placeholder="Enter first name"
                      />
                      <FormField
                        label="Last Name"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleChange}
                        error={errors.last_name}
                        icon={User}
                        placeholder="Enter last name"
                      />
                      <FormField
                        label="Gender"
                        name="gender"
                        value={formData.gender}
                        onChange={handleChange}
                        options={[
                          { value: "", label: "Select gender" },
                          { value: "MALE", label: "Male" },
                          { value: "FEMALE", label: "Female" },
                          { value: "OTHER", label: "Other" },
                        ]}
                      />
                      <FormField
                        label="Date of Birth"
                        name="date_of_birth"
                        type="date"
                        value={formData.date_of_birth}
                        onChange={handleChange}
                        icon={Calendar}
                      />
                    </div>
                    <div className="mt-4">
                      <FormField
                        label="Address"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        icon={MapPin}
                        placeholder="Enter address"
                      />
                    </div>
                  </div>

                  {/* Roles Selection */}
                  <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-violet-500" />
                      Assign Roles
                    </h3>
                    {errors.roles && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-3 text-xs text-red-500 flex items-center gap-1"
                      >
                        <AlertCircle className="w-3 h-3" />
                        {errors.roles}
                      </motion.p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role) => (
                        <motion.button
                          key={role.role_id}
                          type="button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleRole(role.role_id)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            selectedRoles.includes(role.role_id)
                              ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg"
                              : "bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600"
                          }`}
                        >
                          {role.name}
                        </motion.button>
                      ))}
                      {roles.length === 0 && (
                        <p className="text-sm text-gray-400">
                          No roles available
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer with Errors */}
            <div className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
              {/* Error Summary */}
              <AnimatePresence>
                {errors.submit && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800"
                  >
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <p className="text-sm font-medium">{errors.submit}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 p-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Create User
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Excel Upload Modal
interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ExcelUploadModal: React.FC<ExcelUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [uploadStatus, setUploadStatus] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (
        !selectedFile.name.endsWith(".xlsx") &&
        !selectedFile.name.endsWith(".xls")
      ) {
        setError("Please select an Excel file (.xlsx or .xls)");
        return;
      }
      setFile(selectedFile);
      setError(null);
      parseFile(selectedFile);
    }
  };

  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        setPreview(jsonData.slice(0, 5)); // Show first 5 rows as preview
      } catch (err) {
        setError("Failed to parse Excel file");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setUploadStatus(null);

    try {
      const result = await bulkCreateUsers(file);
      setUploadStatus(result);
      if (result.success > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to upload users");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setPreview([]);
    setError(null);
    setUploadStatus(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Bulk Upload Users
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Upload Excel file with user data
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {uploadStatus && (
                <div className="mb-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">
                      Upload Complete
                    </p>
                  </div>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    Successfully created: {uploadStatus.success} users
                  </p>
                  {uploadStatus.failed > 0 && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Failed: {uploadStatus.failed} users
                    </p>
                  )}
                  {uploadStatus.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-500">
                      {uploadStatus.errors.slice(0, 3).map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!file ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
                >
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    Click to upload Excel file
                  </p>
                  <p className="text-sm text-gray-400">
                    Supports .xlsx and .xls files
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        setPreview([]);
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>

                  {preview.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Preview (first 5 rows)
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-100 dark:bg-slate-700">
                              {Object.keys(preview[0]).map((key) => (
                                <th
                                  key={key}
                                  className="px-2 py-1 text-left text-gray-600 dark:text-gray-300"
                                >
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.map((row, i) => (
                              <tr
                                key={i}
                                className="border-b border-gray-100 dark:border-slate-600"
                              >
                                {Object.values(row).map((val: any, j) => (
                                  <td
                                    key={j}
                                    className="px-2 py-1 text-gray-700 dark:text-gray-300"
                                  >
                                    {String(val)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {uploadStatus ? "Close" : "Cancel"}
              </button>
              {file && !uploadStatus && (
                <button
                  onClick={handleUpload}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Users
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

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
              user.user.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"
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
                  className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="hidden sm:inline">Bulk Upload</span>
                </button>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
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
