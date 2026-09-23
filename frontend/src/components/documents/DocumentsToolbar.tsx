import React from "react";
import { motion } from "framer-motion";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronRight,
  FolderPlus,
  Grid2X2,
  Home,
  LayoutList,
  PanelLeft,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import type {
  BreadcrumbItem,
  TabType,
  ViewMode,
  SortOption,
  ShareFilter,
} from "./types";

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
  shareFilter?: ShareFilter;
  onShareFilterChange?: (filter: ShareFilter) => void;
  mySharedItemsCount?: number;
  myTotalItemsCount?: number;
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

const SORTS: { key: SortOption; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "size", label: "Size" },
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
];

/** Square icon button, sized to the same 36px target as the rest of the app. */
const IconButton: React.FC<{
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, onClick, children }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg transition-colors ${
      active
        ? "el-chip-brand"
        : "text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
    }`}
  >
    {children}
  </button>
);

/**
 * The documents chrome.
 *
 * Was two cramped rows with native `<select>` elements, a green upload button
 * and `bg-blue-500` actions — none of which appear anywhere else in the MIS.
 * Rebuilt on the same vocabulary as the rest of the app: `el-segment` for
 * exclusive choices, `rounded-pill` brand actions, lucide icons, 36px targets.
 */
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
  shareFilter = "all",
  onShareFilterChange,
  mySharedItemsCount = 0,
  myTotalItemsCount = 0,
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
  const sharedTotal = sharedDocumentsCount + sharedFoldersCount;
  const isMine = activeTab === "my-documents";

  const filters: { key: ShareFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: myTotalItemsCount },
    { key: "shared", label: "Shared", count: mySharedItemsCount },
    { key: "private", label: "Private", count: myTotalItemsCount - mySharedItemsCount },
  ];

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3 dark:border-white/[0.07] dark:bg-transparent">
      {/* Row 1 — where you are, and what you can do about it */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="el-segment flex-shrink-0" role="group" aria-label="Document scope">
          <button
            onClick={() => {
              onTabChange("my-documents");
              onGoToRoot();
            }}
            aria-pressed={isMine}
            className={`min-h-[34px] rounded-pill px-3.5 text-xs font-semibold transition-colors ${
              isMine
                ? "el-segment-on"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            My files
          </button>
          <button
            onClick={() => onTabChange("shared-with-me")}
            aria-pressed={!isMine}
            className={`relative inline-flex min-h-[34px] items-center gap-1.5 rounded-pill px-3.5 text-xs font-semibold transition-colors ${
              !isMine
                ? "el-segment-on"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Shared
            {sharedTotal > 0 && (
              <span
                className={`rounded-pill px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  unreadSharedCount > 0
                    ? "bg-brand-500 text-white"
                    : "bg-gray-200 text-gray-600 dark:bg-white/[0.12] dark:text-gray-300"
                }`}
              >
                {sharedTotal}
              </span>
            )}
          </button>
        </div>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          <IconButton label="Go to root" onClick={onGoToRoot}>
            <Home className="h-4 w-4" />
          </IconButton>
          {breadcrumbs.map((item, index) => (
            <React.Fragment key={index}>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600" />
              <button
                onClick={() => onBreadcrumbClick(index)}
                className={`max-w-[160px] truncate rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  index === breadcrumbs.length - 1
                    ? "font-semibold text-gray-800 dark:text-gray-100"
                    : "text-gray-500 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-white/[0.08]"
                }`}
              >
                {item.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* Search */}
        <div className="relative w-full flex-shrink-0 sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Search files"
            placeholder={isMine ? "Search this folder..." : "Search shared..."}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="el-input min-h-[36px] rounded-pill pl-9 pr-8 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-pill p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.08]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {isMine && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={onCreateFolder}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-pill border border-gray-200 px-3.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.06]"
            >
              <FolderPlus className="h-4 w-4" />
              <span className="hidden md:inline">New folder</span>
            </button>
            <motion.button
              whileTap={canUpload ? { scale: 0.97 } : undefined}
              onClick={onUploadClick}
              disabled={isUploading || !canUpload}
              title={!canUpload ? canUploadReason : undefined}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-pill bg-brand-500 px-4 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-brand-600 focus:outline-none focus-visible:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden md:inline">
                {isUploading ? "Uploading..." : "Upload"}
              </span>
            </motion.button>
          </div>
        )}
      </div>

      {/* Row 2 — how the list is shown. Quiet, because it is changed rarely. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {isMine && onShareFilterChange && (
          <div className="el-segment" role="group" aria-label="Filter by sharing">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => onShareFilterChange(f.key)}
                aria-pressed={shareFilter === f.key}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-pill px-3 text-xs font-semibold transition-colors ${
                  shareFilter === f.key
                    ? "el-segment-on"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {f.label}
                <span className="opacity-60 tabular-nums">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="el-segment" role="group" aria-label="Sort by">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => onSortChange(s.key)}
                aria-pressed={sortBy === s.key}
                className={`min-h-[32px] rounded-pill px-3 text-xs font-semibold transition-colors ${
                  sortBy === s.key
                    ? "el-segment-on"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <IconButton
            label={sortOrder === "asc" ? "Ascending" : "Descending"}
            onClick={onSortOrderChange}
          >
            {sortOrder === "asc" ? (
              <ArrowUpAZ className="h-4 w-4" />
            ) : (
              <ArrowDownAZ className="h-4 w-4" />
            )}
          </IconButton>

          <div className="el-segment" role="group" aria-label="View as">
            <button
              onClick={() => onViewModeChange("grid")}
              aria-pressed={viewMode === "grid"}
              title="Grid view"
              aria-label="Grid view"
              className={`grid h-8 w-8 place-items-center rounded-pill transition-colors ${
                viewMode === "grid"
                  ? "el-segment-on"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <Grid2X2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              aria-pressed={viewMode === "list"}
              title="List view"
              aria-label="List view"
              className={`grid h-8 w-8 place-items-center rounded-pill transition-colors ${
                viewMode === "list"
                  ? "el-segment-on"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>

          {isMine && (
            <IconButton
              label="Toggle folder tree"
              active={showFolderTree}
              onClick={onToggleFolderTree}
            >
              <PanelLeft className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentsToolbar;
