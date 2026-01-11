import React from "react";
import { motion } from "framer-motion";
import { FiFolder, FiMoreVertical, FiUser } from "react-icons/fi";
import { type Folder } from "../../api/documents";

interface FolderItemProps {
  folder: Folder;
  viewMode: "grid" | "list";
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMoreClick?: (e: React.MouseEvent) => void;
  showOwner?: boolean;
  ownerName?: string;
  itemCount?: number;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  viewMode,
  onClick,
  onContextMenu,
  onMoreClick,
  showOwner = false,
  ownerName,
  itemCount,
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
        className="p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-xl border-gray-200 dark:border-gray-700/20 bg-white dark:bg-gray-800/40 hover:border-blue-300 dark:hover:border-blue-500"
      >
        <div className="flex flex-col items-center text-center">
          <motion.div
            whileHover={{ rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <FiFolder
              className="w-14 h-14 mb-3"
              style={{ color: folder.color }}
            />
          </motion.div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate w-full px-2">
            {folder.name}
          </p>
          <p className="text-xs text-gray-400 mt-1">Folder</p>
          {itemCount !== undefined && (
            <p className="text-xs text-gray-400 mt-1">
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </p>
          )}
          {showOwner && ownerName && (
            <div className="flex items-center gap-1 mt-1">
              <FiUser className="w-3 h-3 text-gray-400" />
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
          <motion.div
            whileHover={{ rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <FiFolder className="w-5 h-5" style={{ color: folder.color }} />
          </motion.div>
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {folder.name}
            </span>
          </div>
          {showOwner && ownerName && (
            <div className="flex items-center gap-1 mt-0.5">
              <FiUser className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {ownerName}
              </span>
            </div>
          )}
        </div>

        {/* Item count */}
        <div className="hidden md:flex items-center w-20 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {itemCount !== undefined
              ? `${itemCount} item${itemCount !== 1 ? "s" : ""}`
              : "—"}
          </span>
        </div>

        {/* Type */}
        <div className="hidden lg:flex items-center w-16 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Folder
          </span>
        </div>

        {/* Modified */}
        <div className="hidden xl:flex items-center w-24 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(folder.created_at).toLocaleDateString()}
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

export default FolderItem;
