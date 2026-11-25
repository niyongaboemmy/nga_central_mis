import { Role, createUser, getRoles, User as UserType, findUserElsewhere, importUserFromSchool, type PersonElsewhere } from "../api/users";
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
  Search,
  School,
  ArrowLeftRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import SelectField from "./ui/SelectField";

// Form field with validation
interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
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
          <SelectField
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
          </SelectField>
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
  onSuccess: (user: UserType) => void;
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
  // One person, several schools: their account elsewhere, copied here with these roles.
  const [findText, setFindText] = useState("");
  const [finding, setFinding] = useState(false);
  const [matches, setMatches] = useState<PersonElsewhere[] | null>(null);
  const [matchedFor, setMatchedFor] = useState("");
  const [existing, setExisting] = useState<PersonElsewhere | null>(null);
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
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
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
        : [...prev, roleId],
    );
  };

  const lookup = async (identifier: string, quiet = false) => {
    const id = identifier.trim();
    if (id.length < 3) return;
    setFinding(true);
    try {
      const found = await findUserElsewhere(id);
      setMatches(found);
      setMatchedFor(id);
    } catch (err: any) {
      if (!quiet) setErrors((prev) => ({ ...prev, find: err?.response?.data?.message || "Search failed" }));
    } finally {
      setFinding(false);
    }
  };

  const pickExisting = (m: PersonElsewhere) => {
    setExisting(m);
    setErrors({});
  };

  const handleImport = async () => {
    if (!existing) return;
    if (selectedRoles.length === 0) {
      setErrors({ roles: "Please select at least one role" });
      return;
    }
    setLoading(true);
    setErrors({});
    try {
      const r = await importUserFromSchool({ identifier: matchedFor, sourceTid: existing.tid, roles: selectedRoles });
      onSuccess({ user_id: r.userId, username: r.username, email: existing.email } as UserType);
      onClose();
      resetForm();
    } catch (err: any) {
      setErrors({ submit: err?.response?.data?.message || "Failed to add this person" });
    } finally {
      setLoading(false);
    }
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
        (user) => {
          onSuccess(user);
        },
        (err) => {
          throw err;
        },
      );

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
    setFindText("");
    setMatches(null);
    setMatchedFor("");
    setExisting(null);
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
                  {/* Already in another school? */}
                  {!existing && (
                    <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/10 p-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                        <ArrowLeftRight className="w-4 h-4 text-blue-500" />
                        Already in another school?
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                        Find them by their exact e-mail or username and add them here with a new role. They keep their password.
                      </p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                          <input
                            aria-label="E-mail or username in another school"
                            value={findText}
                            onChange={(e) => setFindText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void lookup(findText);
                              }
                            }}
                            placeholder="name@example.com or username"
                            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void lookup(findText)}
                          disabled={finding || findText.trim().length < 3}
                          className="px-4 py-2 rounded-full text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-2"
                        >
                          {finding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          Find
                        </button>
                      </div>
                      {errors.find && <p className="mt-2 text-xs text-red-500">{errors.find}</p>}
                      {finding && (
                        <div className="mt-3 h-14 rounded-xl bg-white/70 dark:bg-slate-800/70 animate-pulse" aria-busy="true" />
                      )}
                      {!finding && matches !== null && (
                        <div className="mt-3 space-y-2" aria-live="polite">
                          {matches.length === 0 ? (
                            <p className="text-xs text-gray-600 dark:text-gray-300">No other school has an account for “{matchedFor}”.</p>
                          ) : (
                            matches.map((m) => (
                              <div key={`${m.tid}-${m.userId}`} className="flex flex-wrap items-center gap-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200 flex items-center justify-center text-sm font-bold">
                                  {m.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{m.name}</p>
                                  <p className="text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-3">
                                    <span className="inline-flex items-center gap-1"><School className="w-3 h-3" />{m.schoolName}</span>
                                    {m.email && <span>{m.email}</span>}
                                    {m.roles.length > 0 && <span>{m.roles.join(", ")}</span>}
                                  </p>
                                </div>
                                {m.alreadyInTarget ? (
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Already in this school</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => pickExisting(m)}
                                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    Add to this school
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {existing && (
                    <div className="rounded-xl border border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 p-4 flex flex-wrap items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                        {existing.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white">{existing.name}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          From {existing.schoolName} · {existing.email} · @{existing.username}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                          Choose their role in this school below. They sign in with the password they already use.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExisting(null)}
                        className="text-xs font-medium text-blue-700 dark:text-blue-200 hover:underline"
                      >
                        Create a new account instead
                      </button>
                    </div>
                  )}

                  {!existing && (<>
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
                      <div
                        onBlur={() => {
                          const v = formData.email.trim();
                          if (validateEmail(v) && v.toLowerCase() !== matchedFor.toLowerCase()) void lookup(v, true);
                        }}
                      >
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
                      {matches && matches.length > 0 && matchedFor.toLowerCase() === formData.email.trim().toLowerCase() && !matches[0].alreadyInTarget && (
                        <p className="mt-1.5 text-xs text-blue-700 dark:text-blue-200">
                          {matches[0].name} already has an account at {matches[0].schoolName}.{" "}
                          <button type="button" onClick={() => pickExisting(matches[0])} className="font-semibold underline">
                            Add them instead
                          </button>
                        </p>
                      )}
                      </div>
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

                  </>)}

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
                  onClick={existing ? handleImport : handleSubmit}
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-medium rounded-full transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {existing ? "Adding..." : "Creating..."}
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      {existing ? "Add to this school" : "Create User"}
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
