import React from "react";
import { motion } from "framer-motion";
import {
  FiMoreVertical,
  FiFile,
  FiImage,
  FiVideo,
  FiMusic,
  FiFileText,
  FiArchive,
  FiCode,
  FiFilePlus,
  FiUsers,
} from "react-icons/fi";
import {
  formatFileSize,
  getFileTypeColor,
  type Document,
} from "../../api/documents";

interface FileItemProps {
  document: Document;
  viewMode: "grid" | "list";
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMoreClick?: (e: React.MouseEvent) => void;
  onShareBadgeClick?: (e: React.MouseEvent) => void;
  showOwner?: boolean;
  ownerName?: string;
}

const ShareCountBadge: React.FC<{
  count: number;
  onClick?: (e: React.MouseEvent) => void;
  variant: "grid" | "list";
}> = ({ count, onClick, variant }) => {
  if (!count) return null;
  const base =
    "flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      title={`Shared with ${count} ${count === 1 ? "person" : "people"} — click to manage`}
      className={
        variant === "grid"
          ? `${base} absolute top-2 right-2 px-2 py-1 text-[11px] shadow-sm`
          : `${base} px-2 py-0.5 text-xs flex-shrink-0`
      }
    >
      <FiUsers className="w-3 h-3" />
      {count}
    </button>
  );
};

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

const FileItem: React.FC<FileItemProps> = ({
  document,
  viewMode,
  onClick,
  onContextMenu,
  onMoreClick,
  onShareBadgeClick,
  showOwner = false,
  ownerName,
}) => {
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
        className="relative p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-xl border-gray-200 dark:border-gray-700/20 bg-white dark:bg-gray-800/40 hover:border-blue-300 dark:hover:border-blue-500"
      >
        <ShareCountBadge
          count={document.share_count || 0}
          onClick={onShareBadgeClick}
          variant="grid"
        />
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 transform hover:scale-110 transition-transform duration-200">
            {getFileIconComponent(document)}
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate w-full px-2">
            {document.original_name}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatFileSize(document.file_size)}
          </p>
          {showOwner && ownerName && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-gray-400">{ownerName}</span>
            </div>
          )}
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
            {getFileIconComponent(document, 20)}
          </div>
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {document.original_name}
            </span>
          </div>
          {showOwner && ownerName && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {ownerName}
            </div>
          )}
        </div>

        {/* Size */}
        <div className="hidden md:flex items-center w-20 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatFileSize(document.file_size)}
          </span>
        </div>

        {/* Type */}
        <div className="hidden lg:flex items-center w-16 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400 uppercase">
            {document.file_extension}
          </span>
        </div>

        {/* Modified */}
        <div className="hidden xl:flex items-center w-24 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(document.created_at).toLocaleDateString()}
          </span>
        </div>

        {/* Share count */}
        <div className="flex-shrink-0 mr-1">
          <ShareCountBadge
            count={document.share_count || 0}
            onClick={onShareBadgeClick}
            variant="list"
          />
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

export default FileItem;
