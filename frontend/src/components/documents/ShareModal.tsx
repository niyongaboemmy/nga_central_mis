import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiX,
  FiFolder,
  FiUser,
  FiShield,
  FiLink,
  FiSearch,
  FiPlus,
  FiTrash,
  FiDownload,
  FiEdit2,
  FiShare2,
  FiEye,
  FiClock,
  FiCopy,
  FiCheckCircle,
  FiAlertCircle,
} from "react-icons/fi";
import {
  documentApi,
  folderPermissionApi,
  getFileTypeColor,
  type Folder,
  type Document,
  type UserSearchResult,
  type Role,
} from "../../api/documents";
import {
  modalVariants,
  getInitials,
  getAvatarColor,
  getPermissionBadgeColor,
  type ShareTabType,
} from "./types";
import {
  FiFile,
  FiImage,
  FiVideo,
  FiMusic,
  FiFileText,
  FiArchive,
  FiCode,
  FiFilePlus,
} from "react-icons/fi";

// Get file icon component helper
const getFileIconComponent = (doc: Document, size: number = 48) => {
  const colorClass = getFileTypeColor(doc.mime_type, doc.file_extension);
  const iconProps = {
    className: `${size === 48 ? "w-12 h-12" : "w-5 h-5"} ${colorClass}`,
  };
  const ext = doc.file_extension.toLowerCase();

  switch (true) {
    case doc.mime_type.startsWith("image/"):
      return <FiImage {...iconProps} />;
    case doc.mime_type.startsWith("video/"):
      return <FiVideo {...iconProps} />;
    case doc.mime_type.startsWith("audio/"):
      return <FiMusic {...iconProps} />;
    case ext === "pdf":
      return <FiFileText {...iconProps} />;
    case ["doc", "docx"].includes(ext):
      return <FiFilePlus {...iconProps} />;
    case ["xls", "xlsx", "csv"].includes(ext):
      return <FiFileText {...iconProps} />;
    case ["ppt", "pptx"].includes(ext):
      return <FiFileText {...iconProps} />;
    case ["zip", "rar", "7z", "tar", "gz"].includes(ext):
      return <FiArchive {...iconProps} />;
    case ["js", "ts", "html", "css", "json", "py", "java", "c", "cpp"].includes(
      ext
    ):
      return <FiCode {...iconProps} />;
    default:
      return <FiFile {...iconProps} />;
  }
};

interface ShareModalProps {
  isOpen: boolean;
  shareItem: Folder | Document | null;
  shareTab: ShareTabType;
  userSearchQuery: string;
  searchedUsers: UserSearchResult[];
  selectedShareUsers: UserSearchResult[];
  roles: Role[];
  selectedShareRoles: Role[];
  sharePermission: string;
  isSearchingUsers: boolean;
  isSharing: boolean;
  isLoadingRoles: boolean;
  existingPermissions: any[];
  isLoadingPermissions: boolean;
  isRemovingPermission: boolean;
  expirationDate: string;
  copySuccess: boolean;
  searchError: string | null;
  onShareTabChange: (tab: ShareTabType) => void;
  onUserSearchQueryChange: (query: string) => void;
  onSearchUsers: () => void;
  onAddUser: (user: UserSearchResult) => void;
  onRemoveUser: (userId: number) => void;
  onToggleRole: (role: Role) => void;
  onRemoveRole: (roleId: number) => void;
  onPermissionChange: (permission: string) => void;
  onExpirationDateChange: (date: string) => void;
  onCopyLink: () => void;
  onShare: () => void;
  onRemovePermission: (permissionId: number) => void;
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  shareItem,
  shareTab,
  userSearchQuery,
  searchedUsers,
  selectedShareUsers,
  roles,
  selectedShareRoles,
  sharePermission,
  isSearchingUsers,
  isSharing,
  isLoadingRoles,
  existingPermissions,
  isLoadingPermissions,
  isRemovingPermission,
  expirationDate,
  copySuccess,
  searchError,
  onShareTabChange,
  onUserSearchQueryChange,
  onSearchUsers,
  onAddUser,
  onRemoveUser,
  onToggleRole,
  onRemoveRole,
  onPermissionChange,
  onExpirationDateChange,
  onCopyLink,
  onShare,
  onRemovePermission,
  onClose,
}) => {
  const isFolderItem =
    shareItem && (shareItem as Folder).folder_id !== undefined;

  const handleRemovePermission = async (permissionId: number) => {
    try {
      if (isFolderItem && shareItem) {
        await folderPermissionApi.revokeAccess(permissionId);
      } else if (shareItem) {
        await documentApi.revokeAccess(permissionId);
      }
      onRemovePermission(permissionId);
    } catch (error) {
      console.error("Failed to remove permission:", error);
    }
  };

  if (!isOpen || !shareItem) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 p-6 text-white">
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-lg rounded-2xl flex items-center justify-center">
                {isFolderItem ? (
                  <FiFolder className="w-8 h-8 text-white" />
                ) : (
                  <div className="transform hover:scale-110 transition-transform">
                    {getFileIconComponent(shareItem as Document, 48)}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  Share "
                  {isFolderItem
                    ? (shareItem as Folder).name
                    : (shareItem as Document).original_name}
                  "
                </h2>
                <p className="text-white/80 text-sm mt-1">
                  {existingPermissions.length} people have access
                </p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-2 bg-white/20 backdrop-blur-lg rounded-xl hover:bg-white/30 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {[
            { id: "people" as ShareTabType, icon: FiUser, label: "People" },
            { id: "roles" as ShareTabType, icon: FiShield, label: "Roles" },
            { id: "links" as ShareTabType, icon: FiLink, label: "Links" },
          ].map((tab) => (
            <motion.button
              key={tab.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onShareTabChange(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative ${
                shareTab === tab.id
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {shareTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-500"
                />
              )}
            </motion.button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {shareTab === "people" && (
            <div className="space-y-6">
              {/* Existing permissions */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  People with access
                </h3>
                {isLoadingPermissions ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  </div>
                ) : existingPermissions.length > 0 ? (
                  <div className="space-y-2">
                    {existingPermissions.map((perm) => (
                      <motion.div
                        key={perm.permission_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold ${getAvatarColor(
                              perm.user.username
                            )}`}
                          >
                            {getInitials(
                              perm.user.first_name,
                              perm.user.last_name,
                              perm.user.username
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-700 dark:text-gray-200">
                              {perm.user.first_name && perm.user.last_name
                                ? `${perm.user.first_name} ${perm.user.last_name}`
                                : perm.user.username}
                            </p>
                            <p className="text-sm text-gray-500">
                              {perm.user.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${getPermissionBadgeColor(
                              perm.permission_type
                            )}`}
                          >
                            {perm.permission_type}
                          </span>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() =>
                              handleRemovePermission(perm.permission_id)
                            }
                            disabled={isRemovingPermission}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isRemovingPermission ? (
                              <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                            ) : (
                              <FiTrash className="w-4 h-4" />
                            )}
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3">
                      <FiUser className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500">No one has access yet</p>
                    <p className="text-sm text-gray-400">
                      Add people below to share this file
                    </p>
                  </div>
                )}
              </div>

              {/* Add people section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  Add people
                </h3>
                <div className="relative flex gap-2">
                  <FiSearch className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <motion.input
                    whileFocus={{ scale: 1.01 }}
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => onUserSearchQueryChange(e.target.value)}
                    placeholder="Search by email, name, or username..."
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onSearchUsers}
                    disabled={isSearchingUsers || userSearchQuery.length < 2}
                    className="px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <FiSearch className="w-4 h-4" />
                    Search
                  </motion.button>
                </div>

                {/* Search Error */}
                {searchError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400"
                  >
                    <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">{searchError}</p>
                  </motion.div>
                )}

                {/* Search Results */}
                <AnimatePresence>
                  {isSearchingUsers && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-4 p-8 text-center text-gray-500"
                    >
                      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
                      <p className="text-sm mt-2">Searching...</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {!isSearchingUsers && searchedUsers.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden"
                    >
                      {searchedUsers.map((user) => (
                        <motion.button
                          key={user.user_id}
                          whileHover={{ x: 5 }}
                          onClick={() => onAddUser(user)}
                          className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                        >
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold ${getAvatarColor(
                              user.username
                            )}`}
                          >
                            {getInitials(
                              user.first_name,
                              user.last_name,
                              user.username
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-700 dark:text-gray-200 truncate">
                              {user.first_name || user.last_name
                                ? `${user.first_name || ""} ${
                                    user.last_name || ""
                                  }`.trim()
                                : user.username}
                            </p>
                            <p className="text-sm text-gray-500 truncate">
                              {user.email}
                            </p>
                          </div>
                          <FiPlus className="w-5 h-5 text-gray-400" />
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Selected users to add */}
              <AnimatePresence>
                {selectedShareUsers.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Selected to add ({selectedShareUsers.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedShareUsers.map((user) => (
                        <motion.div
                          key={user.user_id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold ${getAvatarColor(
                                user.username
                              )}`}
                            >
                              {getInitials(
                                user.first_name,
                                user.last_name,
                                user.username
                              )}
                            </div>
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {user.first_name || user.last_name
                                ? `${user.first_name || ""} ${
                                    user.last_name || ""
                                  }`.trim()
                                : user.username}
                            </span>
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onRemoveUser(user.user_id)}
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          >
                            <FiX className="w-4 h-4 text-red-500" />
                          </motion.button>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {shareTab === "roles" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  Select Roles
                </h3>
                {isLoadingRoles ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  </div>
                ) : roles.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No roles available
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {roles.map((role) => (
                      <motion.button
                        key={role.role_id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onToggleRole(role)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          selectedShareRoles.find(
                            (r) => r.role_id === role.role_id
                          )
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                            : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              selectedShareRoles.find(
                                (r) => r.role_id === role.role_id
                              )
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-500"
                            }`}
                          >
                            <FiShield className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-700 dark:text-gray-200">
                              {role.name}
                            </p>
                            {role.description && (
                              <p className="text-sm text-gray-500 truncate">
                                {role.description}
                              </p>
                            )}
                          </div>
                          {selectedShareRoles.find(
                            (r) => r.role_id === role.role_id
                          ) && (
                            <FiCheckCircle className="w-5 h-5 text-blue-500" />
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected roles */}
              <AnimatePresence>
                {selectedShareRoles.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Selected roles ({selectedShareRoles.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedShareRoles.map((role) => (
                        <motion.div
                          key={role.role_id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                        >
                          <FiShield className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {role.name}
                          </span>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onRemoveRole(role.role_id)}
                            className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full"
                          >
                            <FiX className="w-3 h-3" />
                          </motion.button>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {shareTab === "links" && (
            <div className="space-y-6">
              <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-500 rounded-xl flex items-center justify-center text-white">
                    <FiLink className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                      Share with anyone
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Create a link that anyone can use to access this document
                    </p>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={onCopyLink}
                      className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                        copySuccess
                          ? "bg-green-500 text-white"
                          : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                      }`}
                    >
                      {copySuccess ? (
                        <>
                          <FiCheckCircle className="w-5 h-5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <FiCopy className="w-5 h-5" />
                          <span>Copy link</span>
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Permission selector */}
          {(shareTab === "people" || shareTab === "roles") && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Permission level
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { id: "VIEW", icon: FiEye, label: "View", color: "gray" },
                  {
                    id: "DOWNLOAD",
                    icon: FiDownload,
                    label: "Download",
                    color: "green",
                  },
                  { id: "EDIT", icon: FiEdit2, label: "Edit", color: "blue" },
                  {
                    id: "SHARE",
                    icon: FiShare2,
                    label: "Share",
                    color: "blue",
                  },
                ].map((perm) => (
                  <motion.button
                    key={perm.id}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onPermissionChange(perm.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-center ${
                      sharePermission === perm.id
                        ? `border-${perm.color}-500 bg-${perm.color}-50 dark:bg-${perm.color}-900/20`
                        : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 mx-auto mb-2 rounded-xl bg-${perm.color}-100 dark:bg-${perm.color}-900/30 flex items-center justify-center`}
                    >
                      <perm.icon className={`w-5 h-5 text-${perm.color}-600`} />
                    </div>
                    <p
                      className={`text-sm font-medium ${
                        sharePermission === perm.id
                          ? `text-${perm.color}-600 dark:text-${perm.color}-400`
                          : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {perm.label}
                    </p>
                  </motion.button>
                ))}
              </div>

              {/* Expiration date */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  <div className="flex items-center gap-2">
                    <FiClock className="w-4 h-4" />
                    Access expiration (optional)
                  </div>
                </label>
                <input
                  type="datetime-local"
                  value={expirationDate}
                  onChange={(e) => onExpirationDateChange(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex justify-between items-center">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              className="px-6 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-all"
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onShare}
              disabled={
                (selectedShareUsers.length === 0 &&
                  selectedShareRoles.length === 0) ||
                isSharing
              }
              className={`px-8 py-2 bg-gradient-to-r from-blue-500 to-blue-500 text-white rounded-full shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 flex items-center gap-2 ${
                selectedShareUsers.length > 0 || selectedShareRoles.length > 0
                  ? "hover:from-blue-600 hover:to-blue-600"
                  : ""
              }`}
            >
              {isSharing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <FiShare2 className="w-5 h-5" />
                  Share{" "}
                  {selectedShareUsers.length + selectedShareRoles.length > 0 &&
                    `(${
                      selectedShareUsers.length + selectedShareRoles.length
                    })`}
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ShareModal;
