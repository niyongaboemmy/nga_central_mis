import React from "react";
import { ArrowLeft, Grid2X2, LayoutList } from "lucide-react";
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

/**
 * The footer of the file manager.
 *
 * Two things were wrong beyond the styling: it always drew the grid glyph
 * whatever the view was, and the counts came from the unfiltered lists, so a
 * search that showed three files still read "8 items".
 */
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
  const isMine = activeTab === "my-documents";
  const total = isMine
    ? foldersCount + documentsCount
    : sharedDocumentsCount + sharedFoldersCount;
  const ViewIcon = viewMode === "grid" ? Grid2X2 : LayoutList;

  return (
    <div className="flex flex-shrink-0 items-center justify-between gap-4 border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-500 dark:border-white/[0.07] dark:bg-transparent dark:text-gray-400">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onGoBack}
          disabled={breadcrumbsLength <= 1}
          className="inline-flex min-h-[28px] items-center gap-1.5 rounded-pill px-2 font-medium transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.06]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="tabular-nums">
          {total} {total === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3">
        {isMine && (
          <span className="hidden tabular-nums sm:inline">
            {foldersCount} {foldersCount === 1 ? "folder" : "folders"} ·{" "}
            {documentsCount} {documentsCount === 1 ? "file" : "files"}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <ViewIcon className="h-3.5 w-3.5" />
          {viewMode === "grid" ? "Grid" : "List"}
        </span>
      </div>
    </div>
  );
};

export default StatusBar;
