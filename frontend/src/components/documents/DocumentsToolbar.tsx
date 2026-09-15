import React from "react";
import { motion } from "framer-motion";
import {
  FiFolder,
  FiUsers,
  FiSearch,
  FiGrid,
  FiList,
  FiHome,
  FiChevronRight,
  FiFolderPlus,
  FiUpload,
} from "react-icons/fi";
import type { BreadcrumbItem, TabType, ViewMode, SortOption } from "./types";
import { Sidebar } from "lucide-react";

interface DocumentsToolbarProps {
  activeTab: TabType;
  breadcrumbs: BreadcrumbItem[];
  viewMode: ViewMode;
  searchQuery: string;
  sortBy: SortOption;
  sortOrder: "asc" | "desc";
  sharedDocumentsCount: number;
  sharedFoldersCount: number;
  unreadSharedCount?: number;
  showFolderTree: boolean;
  isUploading: boolean;
  canUpload?: boolean;
  canUploadReason?: string;
  onTabChange: (tab: TabType) => void;
  onBreadcrumbClick: (index: number) => void;
  onGoToRoot: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onSearchChange: (query: string) => void;
  onSortChange: (sort: SortOption) => void;
  onSortOrderChange: () => void;
  onToggleFolderTree: () => void;
  onCreateFolder: () => void;
  onUploadClick: () => void;
}

const DocumentsToolbar: React.FC<DocumentsToolbarProps> = ({
  activeTab,
  breadcrumbs,
  viewMode,
  searchQuery,
  sortBy,
  sortOrder,
  sharedDocumentsCount,
  sharedFoldersCount,
  unreadSharedCount = 0,
  showFolderTree,
  isUploading,
  canUpload = true,
  canUploadReason,
  onTabChange,
  onBreadcrumbClick,
  onGoToRoot,
  onViewModeChange,
  onSearchChange,
  onSortChange,
  onSortOrderChange,
  onToggleFolderTree,
  onCreateFolder,
  onUploadClick,
}) => {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50"
    >
      {/* First Line: Tabs and Controls */}
      <div className="px-4 py-2 flex items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              onTabChange("my-documents");
              onGoToRoot();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeTab === "my-documents"
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
            }`}
          >
            <FiFolder className="w-4 h-4" />
            <span className="hidden sm:inline">My Docs</span>
            <span className="sm:hidden">Docs</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onTabChange("shared-with-me")}
            className={`relative flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeTab === "shared-with-me"
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
            }`}
          >
            <FiUsers className="w-4 h-4" />
            <span className="hidden sm:inline">Shared</span>
            <span className="sm:hidden">Shared</span>
            {(sharedDocumentsCount > 0 || sharedFoldersCount > 0) && (
              <span
                className={`ml-1 px-1.5 py-0.5 text-xs text-white rounded-full transition-colors ${
                  unreadSharedCount > 0 ? "bg-red-500" : "bg-blue-500"
                }`}
              >
                {sharedDocumentsCount + sharedFoldersCount}
              </span>
            )}
            {unreadSharedCount > 0 && (
              <motion.span
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white dark:border-gray-800"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
          </motion.button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="px-2 py-1 text-xs border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-gray-50/50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="date">Date</option>
            <option value="type">Type</option>
          </select>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onSortOrderChange}
            className="p-1.5 text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-lg transition-all"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
          >
            <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
          </motion.button>
          <div className="flex items-center border border-gray-200/50 dark:border-gray-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => onViewModeChange("grid")}
              className={`p-1.5 transition-all ${
                viewMode === "grid"
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
              }`}
              title="Grid View"
            >
              <FiGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`p-1.5 transition-all ${
                viewMode === "list"
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
              }`}
              title="List View"
            >
              <FiList className="w-3.5 h-3.5" />
            </button>
          </div>
          {activeTab === "my-documents" && (
            <button
              onClick={onToggleFolderTree}
              className={`p-1.5 rounded-lg transition-all ${
                showFolderTree
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
              }`}
              title="Toggle Folder Tree"
            >
              <Sidebar className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Second Line: Breadcrumb, Search, Actions */}
      <div className="px-4 pb-2 flex items-center gap-4">
        {/* Breadcrumb */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-hidden">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onGoToRoot}
              className="p-1 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors flex-shrink-0"
            >
              <FiHome className="w-4 h-4 text-gray-500" />
            </motion.button>
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={index}>
                <FiChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  onClick={() => onBreadcrumbClick(index)}
                  className={`px-2 py-1 rounded-lg transition-all truncate max-w-[120px] text-xs ${
                    index === breadcrumbs.length - 1
                      ? "font-medium text-gray-700 dark:text-gray-200 bg-gray-100/50 dark:bg-gray-800/60"
                      : "text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
                  }`}
                >
                  {item.name}
                </motion.button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative flex-shrink-0">
          <FiSearch className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={
              activeTab === "my-documents"
                ? "Search files..."
                : "Search shared..."
            }
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-7 pr-3 py-1.5 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-gray-50/50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32 sm:w-40 lg:w-48 text-sm"
          />
        </div>

        {/* Actions */}
        {activeTab === "my-documents" && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 shadow-sm transition-all"
            >
              <FiFolderPlus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">New Folder</span>
            </motion.button>
            <motion.button
              whileHover={canUpload ? { scale: 1.02 } : undefined}
              whileTap={canUpload ? { scale: 0.98 } : undefined}
              onClick={onUploadClick}
              disabled={isUploading || !canUpload}
              title={!canUpload ? canUploadReason : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiUpload className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {isUploading ? "Uploading..." : "Upload"}
              </span>
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default DocumentsToolbar;
