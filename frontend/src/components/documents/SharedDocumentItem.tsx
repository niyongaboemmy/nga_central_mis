import React from "react";
import { motion } from "framer-motion";
import {
  FiMoreVertical,
  FiUser,
  FiFile,
  FiImage,
  FiVideo,
  FiMusic,
  FiFileText,
  FiArchive,
  FiCode,
  FiFilePlus,
} from "react-icons/fi";
import {
  formatFileSize,
  getFileTypeColor,
  type SharedDocument,
} from "../../api/documents";

// Get file icon component helper
const getFileIconComponent = (doc: any, size: number = 20) => {
  const colorClass = getFileTypeColor(doc.mime_type, doc.file_extension);
  const iconProps = {
    className: `w-${size / 4} h-${size / 4} ${colorClass}`,
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

interface SharedDocumentItemProps {
  sharedDocument: SharedDocument;
  viewMode: "grid" | "list";
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMoreClick?: (e: React.MouseEvent) => void;
}

const SharedDocumentItem: React.FC<SharedDocumentItemProps> = ({
  sharedDocument,
  viewMode,
  onClick,
  onContextMenu,
  onMoreClick,
}) => {
  const ownerName = sharedDocument.permission?.shared_by_user
    ? `${sharedDocument.permission.shared_by_user.first_name || ""} ${
        sharedDocument.permission.shared_by_user.last_name || ""
      }`.trim() || sharedDocument.permission.shared_by_user.username
    : "Unknown";

  if (viewMode === "grid") {
    return (
      <motion.div
        whileHover={{ scale: 1.03, y: -5 }}
        whileTap={{ scale: 0.98 }}
        onContextMenu={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onContextMenu(e);
        }}
        onClick={onClick}
        className="p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-xl border-gray-200 dark:border-gray-700/20 bg-white dark:bg-gray-800/40 hover:border-blue-300 dark:hover:border-blue-500"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 transform hover:scale-110 transition-transform duration-200">
            {getFileIconComponent(sharedDocument.document)}
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate w-full px-2">
            {sharedDocument.document.original_name}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatFileSize(sharedDocument.document.file_size)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <FiUser className="w-3 h-3 text-gray-400" />
            <p className="text-xs text-gray-400 truncate">{ownerName}</p>
          </div>
          <span
            className={`text-xs mt-1 px-2 py-0.5 rounded-full ${
              sharedDocument.permission?.permission_type === "VIEW"
                ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                : sharedDocument.permission?.permission_type === "EDIT"
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            }`}
          >
            {sharedDocument.permission?.permission_type || "VIEW"}
          </span>
        </div>
      </motion.div>
    );
  }

  // List view - Windows 11 style
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onContextMenu(e);
      }}
      onClick={onClick}
      className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors duration-150"
    >
      <div className="flex items-center px-4 py-2 min-h-[48px]">
        {/* Icon */}
        <div className="flex-shrink-0 w-8 h-8 mr-3 flex items-center justify-center">
          <div className="transform group-hover:scale-110 transition-transform duration-200">
            {getFileIconComponent(sharedDocument.document, 20)}
          </div>
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {sharedDocument.document.original_name}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <FiUser className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {ownerName}
            </span>
          </div>
        </div>

        {/* Size */}
        <div className="hidden md:flex items-center w-20 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatFileSize(sharedDocument.document.file_size)}
          </span>
        </div>

        {/* Type */}
        <div className="hidden lg:flex items-center w-16 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400 uppercase">
            {sharedDocument.document.file_extension}
          </span>
        </div>

        {/* Permission */}
        <div className="hidden xl:flex items-center w-24 flex-shrink-0">
          <span
            className={`px-2 py-0.5 rounded-full text-xs ${
              sharedDocument.permission?.permission_type === "VIEW"
                ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                : sharedDocument.permission?.permission_type === "EDIT"
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            }`}
          >
            {sharedDocument.permission?.permission_type || "VIEW"}
          </span>
        </div>

        {/* Date Shared */}
        <div className="hidden 2xl:flex items-center w-24 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(
              sharedDocument.permission?.created_at || ""
            ).toLocaleDateString()}
          </span>
        </div>

        {/* More actions */}
        {onMoreClick && (
          <div className="flex-shrink-0 ml-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                onMoreClick(e);
              }}
              className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <FiMoreVertical className="w-4 h-4 text-gray-400" />
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default SharedDocumentItem;
