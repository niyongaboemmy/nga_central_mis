import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Award, Clock, Edit, Plus } from "lucide-react";
import { UserWithProfile, UserRole, Permission } from "../../api/users";
import { StatusBadge } from "./TabShared";
import { Permissions as PermConstants } from "../../constants/permissions";

interface RoleCardProps {
  role: UserRole;
  permissions: Permission[];
}

const RoleCard: React.FC<RoleCardProps> = ({ role, permissions }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-6 bg-gradient-to-br from-blue-100/40 to-blue-100/40 dark:from-slate-900/60 dark:to-slate-900/60 rounded-2xl border border-blue-200/30 dark:border-slate-700/30"
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
            <Clock
              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
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

interface RolesTabProps {
  user: UserWithProfile;
  hasPermission: (perm: string) => boolean;
  loadingRoles: boolean;
  openChangeRoleModal: () => void;
  uniquePermissions: Permission[];
}

const RolesTab: React.FC<RolesTabProps> = ({
  user,
  hasPermission,
  loadingRoles,
  openChangeRoleModal,
  uniquePermissions,
}) => {
  return (
    <div className="space-y-4">
      {user.roles && user.roles.length > 0 ? (
        <div className="space-y-4">
          {user.roles.map((role: UserRole) => (
            <RoleCard
              key={role.role_id}
              role={role}
              permissions={role.permissions || []}
            />
          ))}
          {hasPermission(PermConstants.CHANGE_USER_ROLES) && (
            <div className="flex justify-center pt-4">
              <button
                onClick={openChangeRoleModal}
                disabled={loadingRoles}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
              >
                {loadingRoles ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Edit className="w-4 h-4" />
                )}
                Change Role
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12">
          <Shield className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">
            No role assigned
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            This user needs to be assigned a role.
          </p>
          {hasPermission(PermConstants.CHANGE_USER_ROLES) && (
            <button
              onClick={openChangeRoleModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors mx-auto"
            >
              <Plus className="w-4 h-4" />
              Assign Role
            </button>
          )}
        </div>
      )}

      {uniquePermissions.length > 0 && (
        <div className="mt-6 p-4 md:p-6 bg-blue-100/40 dark:bg-gray-900 rounded-2xl">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            All Permissions ({uniquePermissions.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {uniquePermissions.map((perm: Permission) => (
              <span
                key={perm.perm_id}
                className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium"
              >
                {perm.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesTab;
