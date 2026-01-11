import { Role, createUser, getRoles } from "../api/users";
import { AnimatePresence, motion } from "framer-motion";
import {
  UserPlus,
  X,
  AtSign,
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Shield,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";

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
            } pr-3 py-2.5 bg-gray-50 dark:bg-slate-800/80 border-2 rounded-xl text-sm focus:outline-none transition-all ${
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
            } pr-3 py-2.5 bg-gray-50 dark:bg-slate-800/80 border-2 rounded-xl text-sm focus:outline-none transition-all ${
              error
                ? "border-red-300 focus:border-red-500 dark:border-red-600"
                : "border-gray-200 dark:border-gray-700 focus:border-blue-500"
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

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
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
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-500 to-blue-600">
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
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
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
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <User className="w-4 h-4 text-green-500" />
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
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" />
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
                          className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${
                            selectedRoles.includes(role.role_id)
                              ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                              : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600"
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
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-medium rounded-full transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
