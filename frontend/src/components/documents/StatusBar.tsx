import React from "react";
import { motion } from "framer-motion";
import { FiGrid } from "react-icons/fi";
import type { TabType, ViewMode } from "./types";

interface StatusBarProps {
  activeTab: TabType;
  foldersCount: number;
  documentsCount: number;
  sharedDocumentsCount: number;
  viewMode: ViewMode;
}

const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  foldersCount,
  documentsCount,
  sharedDocumentsCount,
  viewMode,
}) => {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-500 flex items-center justify-between"
    >
      <span>
        {activeTab === "my-documents"
          ? `${foldersCount + documentsCount} items`
          : `${sharedDocumentsCount} shared documents`}
      </span>
      <div className="flex items-center gap-4">
        {activeTab === "my-documents" && (
          <>
            <span>{foldersCount} folders</span>
            <span>{documentsCount} files</span>
          </>
        )}
        <span className="flex items-center gap-1">
          <FiGrid className="w-4 h-4" />
          {viewMode === "grid" ? "Grid" : "List"}
        </span>
      </div>
    </motion.div>
  );
};

export default StatusBar;
