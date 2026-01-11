import React, { useState } from "react";
import { motion } from "framer-motion";
import { FiFolder, FiHome, FiChevronRight } from "react-icons/fi";
import type { Folder } from "../../api/documents";

interface FolderTreeNode {
  folder_id: number;
  user_id: number;
  parent_folder_id: number | null;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  children?: FolderTreeNode[];
  is_shared?: boolean;
}

interface FolderTreeProps {
  showFolderTree: boolean;
  currentFolderId: number | null;
  folderTree: FolderTreeNode[];
  isLoading?: boolean;
  onNavigateToFolder: (folder: Folder) => void;
  onGoToRoot: () => void;
}

const FolderNode: React.FC<{
  node: FolderTreeNode;
  level: number;
  currentFolderId: number | null;
  onNavigateToFolder: (folder: Folder) => void;
}> = ({ node, level, currentFolderId, onNavigateToFolder }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          onNavigateToFolder(node as Folder);
          if (hasChildren) {
            setIsExpanded(!isExpanded);
          }
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all ${
          currentFolderId === node.folder_id
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm"
            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900"
        }`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        {hasChildren ? (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <FiChevronRight className="w-4 h-4 flex-shrink-0" />
          </motion.div>
        ) : (
          <div className="w-4 h-4 flex-shrink-0" />
        )}
        <motion.div
          whileHover={{ rotate: hasChildren ? 0 : 10 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <FiFolder
            className="w-4 h-4 flex-shrink-0"
            style={{ color: node.color }}
          />
        </motion.div>
        <span className="truncate">{node.name}</span>
        {node.is_shared && (
          <span className="text-xs text-orange-500 ml-auto">shared</span>
        )}
      </motion.button>

      {hasChildren && isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          {node.children!.map((child) => (
            <FolderNode
              key={child.folder_id}
              node={child}
              level={level + 1}
              currentFolderId={currentFolderId}
              onNavigateToFolder={onNavigateToFolder}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
};

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
        width: showFolderTree ? 320 : 0,
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
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition-all mb-2 ${
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
          <div className="space-y-1">
            {folderTree.map((node) => (
              <FolderNode
                key={node.folder_id}
                node={node}
                level={0}
                currentFolderId={currentFolderId}
                onNavigateToFolder={onNavigateToFolder}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default FolderTree;
