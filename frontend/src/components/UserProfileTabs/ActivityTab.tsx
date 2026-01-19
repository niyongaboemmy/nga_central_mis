import React from "react";
import { CheckCircle, Ban, User as UserIcon } from "lucide-react";
import { UserWithProfile } from "../../api/users";
import { Permissions as PermConstants } from "../../constants/permissions";

interface ActivityTabProps {
  user: UserWithProfile;
  hasPermission: (perm: string) => boolean;
  handleToggleUserStatus: () => Promise<void>;
  changingStatus: boolean;
}

const ActivityTab: React.FC<ActivityTabProps> = ({
  user,
  hasPermission,
  handleToggleUserStatus,
  changingStatus,
}) => {
  return (
    <div className="space-y-4">
      <div className="p-6 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-3xl border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              Account Created
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(user.user.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          User account was successfully created and is ready for use.
        </p>
      </div>

      <div className="p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-3xl border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              Profile Setup
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {user.profile
                ? "Profile information is complete"
                : "Profile not yet setup"}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-3xl border border-orange-200 dark:border-orange-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                user.user.status === "ACTIVE"
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-red-100 dark:bg-red-900/30"
              }`}
            >
              {user.user.status === "ACTIVE" ? (
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              ) : (
                <Ban className="w-6 h-6 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                Account Status
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {user.user.status === "ACTIVE"
                  ? "User can login and access the system"
                  : "User cannot login to the system"}
              </p>
            </div>
          </div>
          {hasPermission(PermConstants.ENABLE_DISABLE_USERS) && (
            <button
              onClick={handleToggleUserStatus}
              disabled={changingStatus}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                user.user.status === "ACTIVE"
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-500 hover:bg-green-600 text-white"
              } disabled:opacity-50`}
            >
              {changingStatus ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : user.user.status === "ACTIVE" ? (
                <>
                  <Ban className="w-4 h-4" />
                  Disable
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Enable
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityTab;
