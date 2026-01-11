import React from "react";
import { motion } from "framer-motion";
import { FiFolder, FiHome } from "react-icons/fi";
import type { Folder } from "../../api/documents";

interface FolderTreeProps {
  showFolderTree: boolean;
  currentFolderId: number | null;
  folderTree: Folder[];
  isLoading?: boolean;
  onNavigateToFolder: (folder: Folder) => void;
  onGoToRoot: () => void;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  showFolderTree,
  currentFolderId,
  folderTree,
  isLoading,
  onNavigateToFolder,
  onGoToRoot,
}) => {
  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{
        width: showFolderTree ? 280 : 0,
        opacity: showFolderTree ? 1 : 0,
      }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="hidden bg-white dark:bg-gray-800/40 border-r border-gray-200 dark:border-gray-700/30 lg:flex flex-col overflow-hidden"
    >
      <div className="p-4 border-b border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/40">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
            <FiFolder className="w-5 h-5 text-blue-500" />
          </motion.div>
          Quick Access
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onGoToRoot}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
            currentFolderId === null
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900"
          }`}
        >
          <FiHome className="w-4 h-4" />
          My Documents
        </motion.button>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : folderTree.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">
            No folders yet
          </div>
        ) : (
          folderTree.map((folder, index) => (
            <motion.button
              key={folder.folder_id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigateToFolder(folder)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                currentFolderId === folder.folder_id
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900"
              }`}
            >
              <motion.div
                whileHover={{ rotate: 10 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <FiFolder className="w-4 h-4" style={{ color: folder.color }} />
              </motion.div>
              <span className="truncate">{folder.name}</span>
            </motion.button>
          ))
        )}
      </div>
    </motion.div>
  );
};

export default FolderTree;
