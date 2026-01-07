import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User as UserIcon,
  Shield,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Building,
  Clock,
  Award,
  X,
  CheckCircle,
  Ban,
  Clock4,
} from "lucide-react";
import { UserWithProfile, UserRole, Permission } from "../api/users";

// Status badge with icon
const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<
    string,
    { color: string; icon: React.ElementType; label: string }
  > = {
    ACTIVE: {
      color: "bg-gradient-to-r from-green-500 to-green-600",
      icon: CheckCircle,
      label: "Active",
    },
    INACTIVE: {
      color: "bg-gradient-to-r from-slate-400 to-slate-500",
      icon: Clock4,
      label: "Inactive",
    },
    SUSPENDED: {
      color: "bg-gradient-to-r from-rose-500 to-rose-600",
      icon: Ban,
      label: "Suspended",
    },
  };
  const { color, icon: Icon, label } = config[status] || config.ACTIVE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white ${color}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
};

// User type badge
const UserTypeBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    ADMIN: "bg-gradient-to-r from-blue-500 to-blue-600",
    STUDENT: "bg-gradient-to-r from-blue-500 to-blue-600",
    TEACHER: "bg-gradient-to-r from-blue-500 to-blue-600",
    PARENT: "bg-gradient-to-r from-blue-500 to-blue-600",
    STAFF: "bg-gradient-to-r from-slate-500 to-slate-600",
  };
  const color = colors[type] || "bg-gradient-to-r from-gray-500 to-gray-600";

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-normal text-white ${color}`}
    >
      {type}
    </span>
  );
};

// Info item component
const InfoItem = ({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <div
    className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
      highlight
        ? "bg-blue-50 dark:bg-blue-900/20"
        : "bg-gray-50/50 dark:bg-slate-800/50"
    }`}
  >
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        highlight
          ? "bg-blue-100 dark:bg-blue-900/40"
          : "bg-gray-100 dark:bg-slate-700"
      }`}
    >
      <Icon
        className={`w-4.5 h-4.5 ${
          highlight
            ? "text-blue-600 dark:text-blue-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
        {value}
      </p>
    </div>
  </div>
);

// Role card component
const RoleCard = ({
  role,
  permissions,
}: {
  role: UserRole;
  permissions: Permission[];
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {role.name}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {role.description || "No description"}
            </p>
          </div>
        </div>
        <StatusBadge status={role.status} />
      </div>

      {permissions.length > 0 && (
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors mb-2"
          >
            <Award className="w-4 h-4" />
            {permissions.length} Permissions
            {isExpanded ? (
              <Clock className="w-3.5 h-3.5" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {permissions.map((perm) => (
                    <span
                      key={perm.perm_id}
                      className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-xs font-medium"
                    >
                      {perm.name}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

// Main User Profile Modal Component
interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserWithProfile | null;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const [activeTab, setActiveTab] = React.useState<
    "info" | "roles" | "activity"
  >("info");

  if (!user) return null;

  const getUserType = (): string => user.profile?.user_type || "USER";

  // Collect all permissions from all roles
  const allPermissions =
    user.roles?.flatMap((role: UserRole) => role.permissions || []) || [];
  const uniquePermissions = Array.from(
    new Map(allPermissions.map((p: Permission) => [p.perm_id, p])).values()
  );

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
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Banner */}
            <div className="relative h-28 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzLTItMi00LTJjMCAwLTItMi0yLTRzMi00IDItNCAyIDIgNCAyczQtMiA0LTJjMCAwIDIgMiAyIDQiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />

              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>

              {/* Avatar */}
              <div className="absolute -bottom-10 left-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                  className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 border-4 border-white dark:border-slate-900"
                >
                  <UserIcon className="w-10 h-10 text-white" />
                </motion.div>
              </div>
            </div>

            {/* User Info */}
            <div className="pt-14 px-6 pb-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {user.profile?.first_name && user.profile?.last_name
                    ? `${user.profile.first_name} ${user.profile.last_name}`
                    : user.user.username}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  @{user.user.username}
                </p>

                <div className="flex items-center gap-2 mt-2">
                  <UserTypeBadge type={getUserType()} />
                  <StatusBadge status={user.user.status} />
                </div>
              </motion.div>

              {/* Tabs */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex gap-1 mt-4 p-1 bg-gray-100 dark:bg-slate-800 rounded-full"
              >
                {[
                  { id: "info", label: "Info", icon: UserIcon },
                  { id: "roles", label: "Roles", icon: Shield },
                  { id: "activity", label: "Activity", icon: Clock },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all ${
                      activeTab === tab.id
                        ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </motion.div>

              {/* Tab Content */}
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-4 max-h-80 overflow-y-auto"
              >
                {activeTab === "info" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem
                        icon={Mail}
                        label="Email"
                        value={user.user.email}
                        highlight
                      />
                      <InfoItem
                        icon={Phone}
                        label="Phone"
                        value={user.user.phone_number || "Not provided"}
                      />
                      <InfoItem
                        icon={Building}
                        label="Gender"
                        value={user.profile?.gender || "Not specified"}
                      />
                      <InfoItem
                        icon={Calendar}
                        label="Date of Birth"
                        value={
                          user.profile?.date_of_birth
                            ? new Date(
                                user.profile.date_of_birth
                              ).toLocaleDateString()
                            : "Not specified"
                        }
                      />
                      <InfoItem
                        icon={MapPin}
                        label="Address"
                        value={user.profile?.address || "Not provided"}
                      />
                    </div>
                    <InfoItem
                      icon={Clock}
                      label="Account Created"
                      value={new Date(user.user.created_at).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }
                      )}
                      highlight
                    />
                  </div>
                )}

                {activeTab === "roles" && (
                  <div className="space-y-3">
                    {user.roles && user.roles.length > 0 ? (
                      user.roles.map((role: UserRole) => (
                        <RoleCard
                          key={role.role_id}
                          role={role}
                          permissions={role.permissions || []}
                        />
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <Shield className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No roles assigned
                        </p>
                      </div>
                    )}

                    {uniquePermissions.length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                          All Permissions ({uniquePermissions.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {uniquePermissions.map((perm: Permission) => (
                            <span
                              key={perm.perm_id}
                              className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium"
                            >
                              {perm.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "activity" && (
                  <div className="space-y-3">
                    <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            Account Created
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(
                              user.user.created_at
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 pl-13">
                        User account was successfully created and is ready for
                        use.
                      </p>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                          <UserIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            Profile Setup
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {user.profile
                              ? "Profile information is complete"
                              : "Profile not yet setup"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UserProfileModal;
