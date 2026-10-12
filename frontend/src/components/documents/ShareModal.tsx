import UserAvatar from "../ui/UserAvatar";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  FiChevronDown,
} from "react-icons/fi";
import {
  documentApi,
  folderPermissionApi,
  getFileTypeColor,
  type Folder,
  type Document,
  type UserSearchResult,
  type Role,
  type FilterOptions,
  type ShareLink,
} from "../../api/documents";
import {
  modalVariants,
  type ShareTabType,
  type DocumentPermission,
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
import RoleShareComponent from "./RoleShareComponent";

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
      ext,
    ):
      return <FiCode {...iconProps} />;
    default:
      return <FiFile {...iconProps} />;
  }
};

const PERMISSION_LEVELS = [
  { id: "VIEW", icon: FiEye, label: "View", color: "blue" },
  { id: "DOWNLOAD", icon: FiDownload, label: "Download", color: "green" },
  { id: "EDIT", icon: FiEdit2, label: "Edit", color: "blue" },
  { id: "SHARE", icon: FiShare2, label: "Share", color: "blue" },
] as const;

const permissionHelpText = (permission: string, isFolder: boolean) => {
  switch (permission) {
    case "VIEW":
      return isFolder
        ? "Can open the folder and preview files inside it."
        : "Can open and preview this file, but not download or change it.";
    case "DOWNLOAD":
      return isFolder
        ? "Can view the folder and download any file inside it."
        : "Can view and download this file.";
    case "EDIT":
      return isFolder
        ? "Can upload, rename, and organize files inside this folder."
        : "Can replace this file's content and edit its details.";
    case "SHARE":
      return isFolder
        ? "Can do everything Edit can, plus invite other people to this folder."
        : "Can do everything Edit can, plus invite other people to this file.";
    default:
      return "";
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
  existingPermissions: DocumentPermission[];
  isLoadingPermissions: boolean;
  expirationDate: string;
  copySuccess: boolean;
  searchError: string | null;
  // Link sharing
  shareLink: ShareLink | null;
  isLoadingShareLink: boolean;
  isCreatingShareLink: boolean;
  isRevokingShareLink: boolean;
  linkPermission: "VIEW" | "DOWNLOAD";
  onLinkPermissionChange: (permission: "VIEW" | "DOWNLOAD") => void;
  onCreateShareLink: () => void;
  onRevokeShareLink: () => void;
  getShareLinkUrl: (link: ShareLink) => string;
  // Inline per-person permission editing
  updatingPermissionId: number | null;
  onUpdatePermission: (
    permission: DocumentPermission,
    newPermissionType: string,
  ) => void;
  // Filter options
  filterOptions: FilterOptions | null;
  isLoadingFilterOptions: boolean;
  selectedFilterType: string;
  selectedFilterIds: number[];
  selectedAcademicTermId: number | null;
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
  onRemovePermissionError: (message: string) => void;
  onFilterTypeChange: (filterType: string) => void;
  onFilterIdsChange: (filterIds: number[]) => void;
  onAcademicTermIdChange: (termId: number | null) => void;
  onClose: () => void;
}

const PermissionMenu: React.FC<{
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = PERMISSION_LEVELS.find((p) => p.id === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
      >
        {disabled ? (
          <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          current?.label || value
        )}
        {!disabled && <FiChevronDown className="w-3 h-3" />}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden z-10">
          {PERMISSION_LEVELS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onChange(p.id);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2 ${
                value === p.id
                  ? "text-blue-600 dark:text-blue-400 font-medium"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              <p.icon className="w-3.5 h-3.5" />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PermissionPanel: React.FC<{
  sharePermission: string;
  onPermissionChange: (permission: string) => void;
  isFolderItem: boolean;
  expirationDate: string;
  onExpirationDateChange: (date: string) => void;
}> = ({
  sharePermission,
  onPermissionChange,
  isFolderItem,
  expirationDate,
  onExpirationDateChange,
}) => (
  <div>
    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
      Permission level
    </h3>
    <div className="grid grid-cols-2 gap-2">
      {PERMISSION_LEVELS.map((perm) => (
        <button
          key={perm.id}
          onClick={() => onPermissionChange(perm.id)}
          className={`px-2 py-2 rounded-2xl border-2 transition-all flex items-center justify-center gap-1.5 ${
            sharePermission === perm.id
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
          }`}
        >
          <perm.icon
            className={`w-4 h-4 ${
              sharePermission === perm.id ? "text-blue-600" : "text-gray-500"
            }`}
          />
          <span
            className={`text-sm font-medium ${
              sharePermission === perm.id
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-300"
            }`}
          >
            {perm.label}
          </span>
        </button>
      ))}
    </div>
    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
      {permissionHelpText(sharePermission, isFolderItem)}
    </p>

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
        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
      />
    </div>
  </div>
);

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
  expirationDate,
  copySuccess,
  searchError,
  shareLink,
  isLoadingShareLink,
  isCreatingShareLink,
  isRevokingShareLink,
  linkPermission,
  onLinkPermissionChange,
  onCreateShareLink,
  onRevokeShareLink,
  getShareLinkUrl,
  updatingPermissionId,
  onUpdatePermission,
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
  onRemovePermissionError,
  onClose,
}) => {
  const isFolderItem =
    shareItem && (shareItem as Folder).folder_id !== undefined;

  // Debounce the people search so typing doesn't need an explicit click.
  useEffect(() => {
    if (userSearchQuery.trim().length < 2) return;
    const timer = setTimeout(() => onSearchUsers(), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSearchQuery]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const activeLink = useMemo(
    () => (shareLink && !shareLink.revoked_at ? shareLink : null),
    [shareLink],
  );

  const [removingPermissionId, setRemovingPermissionId] = useState<
    number | null
  >(null);

  const handleRemovePermission = async (permissionId: number) => {
    setRemovingPermissionId(permissionId);
    try {
      if (isFolderItem && shareItem) {
        await folderPermissionApi.revokeAccess(permissionId);
      } else if (shareItem) {
        await documentApi.revokeAccess(permissionId);
      }
      onRemovePermission(permissionId);
    } catch (error: any) {
      console.error("Failed to remove permission:", error);
      onRemovePermissionError(
        error.response?.data?.message || "Failed to remove access",
      );
    } finally {
      setRemovingPermissionId(null);
    }
  };

  if (!isOpen || !shareItem) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4"
      >
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          className="bg-white dark:bg-gray-800 w-full sm:max-w-lg lg:max-w-3xl xl:max-w-5xl sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]"
        >
          {/* Mobile drag handle */}
          <div className="sm:hidden flex justify-center pt-2 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>

          {/* Header */}
          <div className="relative bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white flex-shrink-0 sm:rounded-t-3xl">
            <div className="absolute inset-0 bg-black/5 sm:rounded-t-3xl" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-white/20 backdrop-blur-lg rounded-xl flex items-center justify-center flex-shrink-0">
                  {isFolderItem ? (
                    <FiFolder className="w-5 h-5 text-white" />
                  ) : (
                    getFileIconComponent(shareItem as Document, 36)
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold truncate">
                    {isFolderItem
                      ? (shareItem as Folder).name
                      : (shareItem as Document).original_name}
                  </h2>
                  <p className="text-white/80 text-xs">
                    {existingPermissions.length} {existingPermissions.length === 1 ? "person" : "people"} with access
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 bg-white/20 backdrop-blur-lg rounded-full hover:bg-white/30 transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
            {[
              { id: "people" as ShareTabType, icon: FiUser, label: "People" },
              { id: "roles" as ShareTabType, icon: FiShield, label: "Roles" },
              { id: "links" as ShareTabType, icon: FiLink, label: "Links" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => onShareTabChange(tab.id)}
                className={`flex-1 sm:flex-initial flex items-center justify-center sm:justify-start gap-2 px-4 sm:px-6 py-3 text-sm font-medium transition-all relative ${
                  shareTab === tab.id
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {shareTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Content — single scrolling column on mobile/tablet; on desktop,
              split into an independently-scrolling list pane and a fixed
              permission-settings pane so setting the level never requires
              scrolling past a long people list. */}
          <div className="flex-1 overflow-y-auto lg:overflow-hidden lg:flex lg:min-h-0">
          <div className="p-4 lg:flex-1 lg:overflow-y-auto lg:min-h-0">
            {shareTab === "people" && (
              <div className="space-y-4 xl:space-y-0 xl:grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] xl:gap-6 xl:items-start">
                {/* Existing permissions */}
                <div>
                  {existingPermissions.length > 0 && (
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      People with access
                    </h3>
                  )}
                  {isLoadingPermissions ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                  ) : (
                    existingPermissions.length > 0 && (
                      <div className="space-y-2">
                        <AnimatePresence initial={false}>
                        {existingPermissions.map((perm) => (
                          <motion.div
                            key={perm.permission_id}
                            layout
                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <UserAvatar decorative userId={perm.user.user_id} name={[perm.user.first_name, perm.user.last_name].filter(Boolean).join(" ") || perm.user.username} size={40} shape="rounded" />
                              <div className="min-w-0 flex-1">
                                <p
                                  className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate"
                                  title={
                                    perm.user.first_name && perm.user.last_name
                                      ? `${perm.user.first_name} ${perm.user.last_name}`
                                      : perm.user.username
                                  }
                                >
                                  {perm.user.first_name && perm.user.last_name
                                    ? `${perm.user.first_name} ${perm.user.last_name}`
                                    : perm.user.username}
                                </p>
                                <p
                                  className="text-xs text-gray-500 truncate"
                                  title={perm.user.email}
                                >
                                  {perm.user.email}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <PermissionMenu
                                value={perm.permission_type}
                                disabled={updatingPermissionId === perm.permission_id}
                                onChange={(newType) =>
                                  onUpdatePermission(perm, newType)
                                }
                              />
                              <button
                                onClick={() =>
                                  handleRemovePermission(perm.permission_id)
                                }
                                disabled={removingPermissionId === perm.permission_id}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors disabled:opacity-50"
                                aria-label="Remove access"
                              >
                                {removingPermissionId === perm.permission_id ? (
                                  <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                                ) : (
                                  <FiTrash className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </motion.div>
                        ))}
                        </AnimatePresence>
                      </div>
                    )
                  )}
                </div>

                {/* Add people + selected — second grid column on desktop */}
                <div className="space-y-4">
                {/* Add people section */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Add people
                  </h3>
                  <div className="relative flex gap-2">
                    <FiSearch className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => onUserSearchQueryChange(e.target.value)}
                      placeholder="Search by email, name, or username..."
                      className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    {isSearchingUsers && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    )}
                  </div>

                  {searchError && (
                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400">
                      <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
                      <p className="text-sm">{searchError}</p>
                    </div>
                  )}

                  <AnimatePresence>
                    {!isSearchingUsers && searchedUsers.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden"
                      >
                        {searchedUsers.map((user) => (
                          <button
                            key={user.user_id}
                            onClick={() => onAddUser(user)}
                            className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                          >
                            <UserAvatar decorative userId={user.user_id} name={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username} size={36} shape="rounded" />
                            <div className="flex-1 min-w-0">
                              <p
                                className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate"
                                title={
                                  user.first_name || user.last_name
                                    ? `${user.first_name || ""} ${
                                        user.last_name || ""
                                      }`.trim()
                                    : user.username
                                }
                              >
                                {user.first_name || user.last_name
                                  ? `${user.first_name || ""} ${
                                      user.last_name || ""
                                    }`.trim()
                                  : user.username}
                              </p>
                              <p className="text-xs text-gray-500 truncate" title={user.email}>
                                {user.email}
                              </p>
                            </div>
                            <FiPlus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          </button>
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
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Selected to add ({selectedShareUsers.length})
                      </h3>
                      <div className="space-y-2">
                        {selectedShareUsers.map((user) => (
                          <div
                            key={user.user_id}
                            className="flex items-center justify-between gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <UserAvatar decorative userId={user.user_id} name={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username} size={32} shape="rounded" />
                              <span
                                className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate"
                                title={
                                  user.first_name || user.last_name
                                    ? `${user.first_name || ""} ${
                                        user.last_name || ""
                                      }`.trim()
                                    : user.username
                                }
                              >
                                {user.first_name || user.last_name
                                  ? `${user.first_name || ""} ${
                                      user.last_name || ""
                                    }`.trim()
                                  : user.username}
                              </span>
                            </div>
                            <button
                              onClick={() => onRemoveUser(user.user_id)}
                              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors flex-shrink-0"
                            >
                              <FiX className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              </div>
            )}

            {shareTab === "roles" && (
              <RoleShareComponent
                roles={roles}
                selectedRoles={selectedShareRoles}
                selectedUsers={selectedShareUsers}
                onToggleRole={onToggleRole}
                onRemoveRole={onRemoveRole}
                onUserSelect={onAddUser}
                onUserRemove={onRemoveUser}
                onClearAllUsers={() => {
                  selectedShareUsers.forEach((u) => onRemoveUser(u.user_id));
                }}
                isLoadingRoles={isLoadingRoles}
              />
            )}

            {shareTab === "links" && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white flex-shrink-0">
                      <FiLink className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        Anyone with the link (in this MIS)
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Any signed-in user with this link can access{" "}
                        {isFolderItem ? "this folder" : "this file"} — no
                        separate invite needed. It never bypasses login.
                      </p>

                      {isLoadingShareLink ? (
                        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                          <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                          Checking for an existing link...
                        </div>
                      ) : activeLink ? (
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <input
                              readOnly
                              value={getShareLinkUrl(activeLink)}
                              className="flex-1 min-w-0 px-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full text-gray-600 dark:text-gray-300 truncate"
                            />
                            <button
                              onClick={onCopyLink}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all flex-shrink-0 ${
                                copySuccess
                                  ? "bg-green-500 text-white"
                                  : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                              }`}
                            >
                              {copySuccess ? (
                                <FiCheckCircle className="w-4 h-4" />
                              ) : (
                                <FiCopy className="w-4 h-4" />
                              )}
                              {copySuccess ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">
                              Permission:{" "}
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {activeLink.permission_type}
                              </span>
                            </span>
                            <button
                              onClick={onRevokeShareLink}
                              disabled={isRevokingShareLink}
                              className="text-red-500 hover:underline disabled:opacity-50"
                            >
                              {isRevokingShareLink ? "Revoking..." : "Revoke link"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <div className="flex gap-2">
                            {(["VIEW", "DOWNLOAD"] as const).map((p) => (
                              <button
                                key={p}
                                onClick={() => onLinkPermissionChange(p)}
                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                                  linkPermission === p
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                    : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                                }`}
                              >
                                {p === "VIEW" ? "Can view" : "Can download"}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={onCreateShareLink}
                            disabled={isCreatingShareLink}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-full text-sm font-medium transition-all disabled:opacity-50"
                          >
                            {isCreatingShareLink ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Creating link...
                              </>
                            ) : (
                              <>
                                <FiLink className="w-4 h-4" />
                                Create link
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* On mobile/tablet the permission panel stacks right here, below
                the tab content, inside this same scroll container. */}
            {(shareTab === "people" || shareTab === "roles") && (
              <div className="lg:hidden mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
                <PermissionPanel
                  sharePermission={sharePermission}
                  onPermissionChange={onPermissionChange}
                  isFolderItem={!!isFolderItem}
                  expirationDate={expirationDate}
                  onExpirationDateChange={onExpirationDateChange}
                />
              </div>
            )}
          </div>

          {/* Permission panel — desktop-only right column, always visible
              alongside the list so setting the level needs no scrolling. */}
          {(shareTab === "people" || shareTab === "roles") && (
            <div className="hidden lg:block lg:w-72 lg:flex-shrink-0 lg:overflow-y-auto lg:min-h-0 p-4 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700">
              <PermissionPanel
                sharePermission={sharePermission}
                onPermissionChange={onPermissionChange}
                isFolderItem={!!isFolderItem}
                expirationDate={expirationDate}
                onExpirationDateChange={onExpirationDateChange}
              />
            </div>
          )}
          </div>

          {/* Footer Actions */}
          {(shareTab === "people" || shareTab === "roles") && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
              <div className="flex justify-between items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-all"
                >
                  {/* "Cancel" implies discarding a pending action; once there's
                      nothing pending (nothing selected to share), "Close" is
                      the honest label — nothing here would be undone. */}
                  {selectedShareUsers.length > 0 || selectedShareRoles.length > 0
                    ? "Cancel"
                    : "Close"}
                </button>
                <button
                  onClick={onShare}
                  disabled={
                    (selectedShareUsers.length === 0 &&
                      selectedShareRoles.length === 0) ||
                    isSharing
                  }
                  className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-full shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isSharing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sharing...
                    </>
                  ) : (
                    <>
                      <FiShare2 className="w-4 h-4" />
                      Share{" "}
                      {selectedShareUsers.length + selectedShareRoles.length >
                        0 &&
                        `(${
                          selectedShareUsers.length + selectedShareRoles.length
                        })`}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ShareModal;
