import React from "react";
import { motion } from "framer-motion";
import { FiGrid } from "react-icons/fi";
import type { TabType, ViewMode } from "./types";

interface StatusBarProps {
  activeTab: TabType;
  foldersCount: number;
  documentsCount: number;
  sharedDocumentsCount: number;
  sharedFoldersCount: number;
  viewMode: ViewMode;
  onGoBack: () => void;
  breadcrumbsLength: number;
}

const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  foldersCount,
  documentsCount,
  sharedDocumentsCount,
  sharedFoldersCount,
  viewMode,
  onGoBack,
  breadcrumbsLength,
}) => {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-500 flex items-center justify-between"
    >
      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onGoBack}
          disabled={breadcrumbsLength <= 1}
          className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Go Back"
        >
          <span className="text-sm">← Back</span>
        </motion.button>
        <span>
          {activeTab === "my-documents"
            ? `${foldersCount + documentsCount} items`
            : `${sharedDocumentsCount + sharedFoldersCount} shared items`}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {activeTab === "my-documents" && (
          <>
            <span>{foldersCount} folder(s)</span>
            <span>{documentsCount} file(s)</span>
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
