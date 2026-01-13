import React from "react";
import { motion } from "framer-motion";
import {
  User as UserIcon,
  Shield,
  Mail,
  ChevronDown,
  CheckCircle,
} from "lucide-react";
import { UserWithProfile, UserRole } from "../api/users";

// Status badge with icon
const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    ACTIVE: {
      color:
        "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
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
const UserRoleBadge = ({ role }: { role: string }) => {
  const color =
    "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";

  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${color}`}>
      {role}
    </span>
  );
};

interface UserItemCardProps {
  user: UserWithProfile;
  index: number;
  onView: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus?: () => void;
  isToggling?: boolean;
}

const UserItemCard: React.FC<UserItemCardProps> = ({
  user,
  index,
  onView,
  isExpanded,
  onToggleExpand,
  onToggleStatus,
  isToggling = false,
}) => {
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
              user.user.status === "ACTIVE" ? "bg-green-500" : "bg-slate-400"
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
            <UserRoleBadge
              role={
                user.roles?.map((r: UserRole) => r.name).join(", ") || "USER"
              }
            />
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
            <div className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl text-xs">
              <div className="flex flex-col gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onView();
                  }}
                  className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors text-sm font-medium"
                >
                  View Profile
                </button>
                {onToggleStatus && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStatus();
                    }}
                    disabled={isToggling}
                    className={`px-5 py-2 rounded-full transition-colors text-sm font-medium ${
                      isToggling
                        ? "opacity-50 cursor-not-allowed"
                        : user.user.status === "ACTIVE"
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : "bg-green-500 hover:bg-green-600 text-white"
                    }`}
                  >
                    {isToggling ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto" />
                    ) : user.user.status === "ACTIVE" ? (
                      "Disable"
                    ) : (
                      "Enable"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default UserItemCard;
