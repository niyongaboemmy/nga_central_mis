import React from "react";
import { motion } from "framer-motion";
import {
  FiFolder,
  FiUsers,
  FiSearch,
  //   FiGrid,
  //   FiList,
  FiHome,
  FiChevronRight,
  FiFolderPlus,
  FiUpload,
} from "react-icons/fi";
import type { BreadcrumbItem, TabType, ViewMode, SortOption } from "./types";

interface DocumentsToolbarProps {
  activeTab: TabType;
  breadcrumbs: BreadcrumbItem[];
  viewMode: ViewMode;
  searchQuery: string;
  sortBy: SortOption;
  sortOrder: "asc" | "desc";
  sharedDocumentsCount: number;
  showFolderTree: boolean;
  isUploading: boolean;
  currentFolderId: number | null;
  onTabChange: (tab: TabType) => void;
  onBreadcrumbClick: (index: number) => void;
  onGoToRoot: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onSearchChange: (query: string) => void;
  onSortChange: (sort: SortOption) => void;
  onSortOrderChange: () => void;
  onToggleFolderTree: () => void;
  onGoBack: () => void;
  onCreateFolder: () => void;
  onUploadClick: () => void;
}

const DocumentsToolbar: React.FC<DocumentsToolbarProps> = ({
  activeTab,
  breadcrumbs,
//   viewMode,
  searchQuery,
  sortBy,
  sortOrder,
  sharedDocumentsCount,
  showFolderTree,
  isUploading,
  onTabChange,
  onBreadcrumbClick,
  onGoToRoot,
//   onViewModeChange,
  onSearchChange,
  onSortChange,
  onSortOrderChange,
  onToggleFolderTree,
  onGoBack,
  onCreateFolder,
  onUploadClick,
}) => {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/30"
    >
      {/* Tabs */}
      <div className="flex items-center px-4 pt-2 gap-1">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            onTabChange("my-documents");
            onGoToRoot();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
            activeTab === "my-documents"
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500"
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}
        >
          <FiFolder className="w-4 h-4" />
          My Documents
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onTabChange("shared-with-me")}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
            activeTab === "shared-with-me"
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500"
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}
        >
          <FiUsers className="w-4 h-4" />
          Shared with Me
          {sharedDocumentsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
              {sharedDocumentsCount}
            </span>
          )}
        </motion.button>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-3 flex items-center justify-between gap-4">
        {/* Breadcrumb */}
        {activeTab === "my-documents" && (
          <div className="flex items-center gap-1 text-sm flex-1 min-w-0">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onGoToRoot}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <FiHome className="w-5 h-5 text-gray-500" />
            </motion.button>
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={index}>
                <FiChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  onClick={() => onBreadcrumbClick(index)}
                  className={`px-3 py-1.5 rounded-lg transition-all truncate max-w-[150px] ${
                    index === breadcrumbs.length - 1
                      ? "font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800/60"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {item.name}
                </motion.button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeTab === "my-documents" && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleFolderTree}
              className={`p-2.5 rounded-xl transition-all ${
                showFolderTree
                  ? "bg-blue-100/50 dark:bg-gray-800/50 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <FiFolder className="w-5 h-5" />
            </motion.button>
          )}
          <div className="relative hidden sm:block">
            <FiSearch className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <motion.input
              whileFocus={{ scale: 1.02 }}
              type="text"
              placeholder={
                activeTab === "my-documents"
                  ? "Search files..."
                  : "Search shared files..."
              }
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-200 dark:bg-gray-800/30 dark:border-gray-700/50 dark:placeholder:text-gray-600 dark:bg rounded-xl bg-gray-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48 lg:w-64 transition-all"
            />
          </div>
          {/* <div className="flex items-center border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onViewModeChange("grid")}
              className={`p-2.5 transition-all ${
                viewMode === "grid"
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <FiGrid className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onViewModeChange("list")}
              className={`p-2.5 transition-all ${
                viewMode === "list"
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <FiList className="w-5 h-5" />
            </motion.button>
          </div> */}
        </div>
      </div>

      {/* Second Toolbar Row */}
      {activeTab === "my-documents" && (
        <div className="px-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onGoBack}
              disabled={breadcrumbs.length === 1}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              ← Back
            </motion.button>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/40 rounded-xl bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="date">Date Modified</option>
              <option value="type">Type</option>
            </select>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onSortOrderChange}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
            >
              {sortOrder === "asc" ? (
                <span className="text-lg">↑</span>
              ) : (
                <span className="text-lg">↓</span>
              )}
            </motion.button>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCreateFolder}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 shadow-blue-500/30 transition-all"
            >
              <FiFolderPlus className="w-4 h-4" />
              New Folder
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onUploadClick}
              disabled={isUploading}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full hover:from-green-600 hover:to-green-700 shadow-green-500/30 transition-all disabled:opacity-50"
            >
              <FiUpload className="w-4 h-4" />
              {isUploading ? "Uploading..." : "Upload"}
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default DocumentsToolbar;
