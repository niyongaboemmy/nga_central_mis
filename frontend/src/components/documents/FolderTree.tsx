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
        onClick={() => onNavigateToFolder(node as Folder)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition-colors ${
          currentFolderId === node.folder_id
            ? "el-chip-brand font-semibold"
            : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
        }`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        {/* Its own hit target: clicking the row navigates, the chevron only
            expands. Sharing one handler meant you could not open a folder
            without collapsing it, or peek inside without leaving where you
            were. */}
        {hasChildren ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            aria-expanded={isExpanded}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setIsExpanded((v) => !v);
              }
            }}
            className="grid h-5 w-5 flex-shrink-0 place-items-center rounded transition-colors hover:bg-gray-200/70 dark:hover:bg-white/[0.10]"
          >
            <motion.span animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.18 }}>
              <FiChevronRight className="h-3.5 w-3.5" />
            </motion.span>
          </span>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}
        <FiFolder className="h-4 w-4 flex-shrink-0" style={{ color: node.color }} />
        <span className="truncate">{node.name}</span>
        {node.is_shared && (
          <span className="el-chip ml-auto rounded-pill px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
            Shared
          </span>
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
        width: showFolderTree ? 264 : 0,
        opacity: showFolderTree ? 1 : 0,
      }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="hidden flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-white/[0.07] dark:bg-transparent lg:flex"
    >
      <div className="flex-shrink-0 border-b border-gray-200 px-4 py-3.5 dark:border-white/[0.07]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Folders
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onGoToRoot}
          className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors ${
            currentFolderId === null
              ? "el-chip-brand"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          }`}
        >
          <FiHome className="w-4 h-4" />
          My Documents
        </motion.button>

        {isLoading ? (
          <div className="space-y-1.5 px-1 py-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.06]"
              />
            ))}
          </div>
        ) : folderTree.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
            No folders yet. Use <span className="font-semibold">New folder</span> to
            make one.
          </p>
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
