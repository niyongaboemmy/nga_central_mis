import React from "react";
import { motion } from "framer-motion";
import { FiUsers, FiFolder } from "react-icons/fi";
import { FolderPlus, Upload } from "lucide-react";
import {
  type Folder,
  type Document,
  type SharedDocument,
} from "../../api/documents";
import {
  containerVariants,
  itemVariants,
  type ViewMode,
  type SortOption,
} from "./types";
import FileItem from "./FileItem";
import FolderItem from "./FolderItem";
import SharedDocumentItem from "./SharedDocumentItem";
import SharedFolderItem from "./SharedFolderItem";

// Type guard to check if item is a folder
const itemIsFolder = (item: Folder | Document): item is Folder => {
  return (
    (item as Folder).folder_id !== undefined &&
    (item as Folder).parent_folder_id !== undefined
  );
};

interface DocumentsContentProps {
  isLoading: boolean;
  isLoadingShared: boolean;
  activeTab: "my-documents" | "shared-with-me";
  viewMode: ViewMode;
  folders: Folder[];
  filteredDocuments: Document[];
  filteredSharedDocuments: SharedDocument[];
  filteredSharedFolders: any[];
  sortBy: SortOption;
  sortOrder: "asc" | "desc";
  currentSharedFolder: any | null;
  onNavigateToFolder: (folder: Folder) => void;
  onNavigateToSharedFolder: (sharedFolder: any) => Promise<void>;
  onNavigateToSharedSubFolder: (folder: Folder) => Promise<void>;
  onPreview: (doc: Document) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: Folder | Document | SharedDocument,
    type: "folder" | "document" | "shared-document" | "shared-folder"
  ) => void;
  onOpenShareModal: (item: Folder | Document) => void;
  /** True when a non-"all" share filter is why the list looks empty. */
  isShareFilterActive?: boolean;
  /** An empty folder offers the two ways to fill it, not just a sentence
   *  pointing at buttons somewhere else on the screen. */
  onCreateFolder?: () => void;
  onUploadClick?: () => void;
  canUpload?: boolean;
}

const DocumentsContent: React.FC<DocumentsContentProps> = ({
  isLoading,
  isLoadingShared,
  activeTab,
  viewMode,
  folders,
  filteredDocuments,
  filteredSharedDocuments,
  filteredSharedFolders,
  sortBy,
  sortOrder,
  currentSharedFolder,
  onNavigateToFolder,
  onNavigateToSharedFolder,
  onNavigateToSharedSubFolder,
  onPreview,
  onContextMenu,
  onOpenShareModal,
  isShareFilterActive = false,
  onCreateFolder,
  onUploadClick,
  canUpload = true,
}) => {
  // Sort items helper
  const getSortedItems = () => {
    const allItems = [...folders, ...filteredDocuments];
    return allItems.sort((a, b) => {
      let comparison = 0;
      const aIsFolder = itemIsFolder(a);
      const bIsFolder = itemIsFolder(b);

      if (aIsFolder && bIsFolder) {
        comparison = a.name.localeCompare(b.name);
      } else if (!aIsFolder && !bIsFolder) {
        if (sortBy === "name") {
          comparison = a.original_name.localeCompare(b.original_name);
        } else if (sortBy === "size") {
          comparison = a.file_size - b.file_size;
        } else if (sortBy === "date") {
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        } else {
          comparison = a.file_extension.localeCompare(b.file_extension);
        }
      } else {
        comparison = aIsFolder ? -1 : 1;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  };

  if (isLoading || (activeTab === "shared-with-me" && isLoadingShared)) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full"
        />
      </div>
    );
  }

  // Empty state for my documents
  if (activeTab === "my-documents" && getSortedItems().length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-full text-gray-400"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <FiFolder className="w-20 h-20 mb-4 opacity-50" />
        </motion.div>
        <p className="text-xl font-medium text-gray-500">
          {isShareFilterActive
            ? "No items match this filter"
            : "This folder is empty"}
        </p>
        <p className="text-sm mt-2">
          {isShareFilterActive
            ? "Try a different sharing filter above"
            : "Upload files or create a new folder"}
        </p>
        {!isShareFilterActive && (onUploadClick || onCreateFolder) && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {onUploadClick && (
              <button
                onClick={onUploadClick}
                disabled={!canUpload}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-pill bg-brand-500 px-5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-600 focus:outline-none focus-visible:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Upload files
              </button>
            )}
            {onCreateFolder && (
              <button
                onClick={onCreateFolder}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-pill px-5 text-sm font-semibold border border-brand-200 bg-brand-50 text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100 focus:outline-none focus-visible:shadow-glow dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20"
              >
                <FolderPlus className="h-4 w-4" />
                New folder
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  // Empty state for shared documents
  if (
    activeTab === "shared-with-me" &&
    filteredSharedDocuments.length === 0 &&
    filteredSharedFolders.length === 0
  ) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-full text-gray-400"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <FiUsers className="w-20 h-20 mb-4 opacity-50" />
        </motion.div>
        <p className="text-xl font-medium text-gray-500">No shared documents</p>
        <p className="text-sm mt-2">
          Documents shared with you will appear here
        </p>
      </motion.div>
    );
  }

  // My documents view
  if (activeTab === "my-documents") {
    const sortedItems = getSortedItems();

    return viewMode === "grid" ? (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
      >
        {sortedItems.map((item, i) => (
          <motion.div key={i + 1} variants={itemVariants}>
            {itemIsFolder(item) ? (
              <FolderItem
                folder={item}
                viewMode="grid"
                onClick={() => onNavigateToFolder(item)}
                onContextMenu={(e) => onContextMenu(e, item, "folder")}
                onShareBadgeClick={() => onOpenShareModal(item)}
              />
            ) : (
              <FileItem
                document={item}
                viewMode="grid"
                onClick={() => onPreview(item)}
                onContextMenu={(e) => onContextMenu(e, item, "document")}
                onShareBadgeClick={() => onOpenShareModal(item)}
              />
            )}
          </motion.div>
        ))}
      </motion.div>
    ) : (
      <div className="w-full">
        {/* Windows 11 style list header */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700/20 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <div className="w-8 mr-3"></div>
            <div className="flex-1">Name</div>
            <div className="hidden md:flex w-20">Size</div>
            <div className="hidden lg:flex w-16">Type</div>
            <div className="hidden xl:flex w-24">Modified</div>
            <div className="w-8"></div>
          </div>
        </div>

        {/* List items */}
        <div className="divide-y divide-gray-100 dark:divide-gray-700/20">
          {sortedItems.map((item, index) => (
            <div key={index + 1}>
              {itemIsFolder(item) ? (
                <FolderItem
                  folder={item}
                  viewMode="list"
                  onClick={() => onNavigateToFolder(item)}
                  onContextMenu={(e) => onContextMenu(e, item, "folder")}
                  onMoreClick={(e) => onContextMenu(e, item, "folder")}
                  onShareBadgeClick={() => onOpenShareModal(item)}
                />
              ) : (
                <FileItem
                  document={item}
                  viewMode="list"
                  onClick={() => onPreview(item)}
                  onContextMenu={(e) => onContextMenu(e, item, "document")}
                  onMoreClick={(e) => onContextMenu(e, item, "document")}
                  onShareBadgeClick={() => onOpenShareModal(item)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Shared with me view
  if (currentSharedFolder) {
    // We're inside a shared folder, show its contents like my-documents
    const sortedItems = [...folders, ...filteredDocuments].sort((a, b) => {
      let comparison = 0;
      const aIsFolder = itemIsFolder(a);
      const bIsFolder = itemIsFolder(b);

      if (aIsFolder && bIsFolder) {
        comparison = a.name.localeCompare(b.name);
      } else if (!aIsFolder && !bIsFolder) {
        if (sortBy === "name") {
          comparison = a.original_name.localeCompare(b.original_name);
        } else if (sortBy === "size") {
          comparison = a.file_size - b.file_size;
        } else if (sortBy === "date") {
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        } else {
          comparison = a.file_extension.localeCompare(b.file_extension);
        }
      } else {
        comparison = aIsFolder ? -1 : 1;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    if (viewMode === "grid") {
      return (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
        >
          {sortedItems.map((item, i) => (
            <motion.div key={i + 1} variants={itemVariants}>
              {itemIsFolder(item) ? (
                <FolderItem
                  folder={item}
                  viewMode="grid"
                  onClick={async () => await onNavigateToSharedSubFolder(item)}
                  onContextMenu={(e) => onContextMenu(e, item, "folder")}
                  showOwner={true}
                  ownerName={
                    currentSharedFolder?.permission?.shared_by_user
                      ? `${
                          currentSharedFolder.permission.shared_by_user
                            .first_name || ""
                        } ${
                          currentSharedFolder.permission.shared_by_user
                            .last_name || ""
                        }`.trim() ||
                        currentSharedFolder.permission.shared_by_user.username
                      : "Unknown"
                  }
                />
              ) : (
                <FileItem
                  document={item}
                  viewMode="grid"
                  onClick={() => onPreview(item)}
                  onContextMenu={(e) => onContextMenu(e, item, "document")}
                  showOwner={true}
                  ownerName={
                    item.owner
                      ? `${item.owner.first_name || ""} ${
                          item.owner.last_name || ""
                        }`.trim() || item.owner.username
                      : "Unknown"
                  }
                />
              )}
            </motion.div>
          ))}
        </motion.div>
      );
    } else {
      // List view for shared folder contents
      return (
        <div className="w-full">
          {/* Windows 11 style list header */}
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700/20 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
              <div className="w-8 mr-3"></div>
              <div className="flex-1">Name</div>
              <div className="hidden md:flex w-20">Size</div>
              <div className="hidden lg:flex w-16">Type</div>
              <div className="hidden xl:flex w-24">Modified</div>
              <div className="w-8"></div>
            </div>
          </div>

          {/* List items */}
          <div className="divide-y divide-gray-100 dark:divide-gray-700/20">
            {sortedItems.map((item, index) => (
              <div key={index + 1}>
                {itemIsFolder(item) ? (
                  <FolderItem
                    folder={item}
                    viewMode="list"
                    onClick={async () =>
                      await onNavigateToSharedSubFolder(item)
                    }
                    onContextMenu={(e) => onContextMenu(e, item, "folder")}
                    onMoreClick={(e) => onContextMenu(e, item, "folder")}
                    showOwner={true}
                    ownerName={
                      item.owner
                        ? `${item.owner.first_name || ""} ${
                            item.owner.last_name || ""
                          }`.trim() || item.owner.username
                        : "Unknown"
                    }
                  />
                ) : (
                  <FileItem
                    document={item}
                    viewMode="list"
                    onClick={() => onPreview(item)}
                    onContextMenu={(e) => onContextMenu(e, item, "document")}
                    onMoreClick={(e) => onContextMenu(e, item, "document")}
                    showOwner={true}
                    ownerName={
                      item.owner
                        ? `${item.owner.first_name || ""} ${
                            item.owner.last_name || ""
                          }`.trim() || item.owner.username
                        : "Unknown"
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  // Root shared view - flat list
  const allSharedItems = [
    ...filteredSharedDocuments.map((item) => ({ ...item, type: "document" })),
    ...filteredSharedFolders.map((item) => ({ ...item, type: "folder" })),
  ].sort((a, b) => {
    // Sort by name
    const aName =
      a.type === "document" ? a.document.original_name : a.folder.name;
    const bName =
      b.type === "document" ? b.document.original_name : b.folder.name;
    return sortOrder === "asc"
      ? aName.localeCompare(bName)
      : bName.localeCompare(aName);
  });

  if (viewMode === "list") {
    return (
      <div className="w-full">
        {/* Windows 11 style list header */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700/20 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <div className="w-8 mr-3"></div>
            <div className="flex-1">Name</div>
            <div className="hidden md:flex w-20">Shared by</div>
            <div className="hidden lg:flex w-16">Items</div>
            <div className="hidden xl:flex w-20">Permission</div>
            <div className="hidden 2xl:flex w-24">Date Shared</div>
            <div className="w-8"></div>
          </div>
        </div>

        {/* List items */}
        <div className="divide-y divide-gray-100 dark:divide-gray-700/20">
          {allSharedItems.map((shared, index) => (
            <div key={index + 1}>
              {shared.type === "document" ? (
                <SharedDocumentItem
                  sharedDocument={shared}
                  viewMode="list"
                  onClick={() => onPreview(shared.document)}
                  onContextMenu={(e) =>
                    onContextMenu(e, shared, "shared-document")
                  }
                  onMoreClick={(e) =>
                    onContextMenu(e, shared, "shared-document")
                  }
                />
              ) : (
                <SharedFolderItem
                  sharedFolder={shared}
                  viewMode="list"
                  onClick={async () => await onNavigateToSharedFolder(shared)}
                  onContextMenu={(e) =>
                    onContextMenu(e, shared, "shared-folder")
                  }
                  onMoreClick={(e) => onContextMenu(e, shared, "shared-folder")}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4"
    >
      {allSharedItems.map((shared) => (
        <motion.div
          key={`shared-${shared.type}-${
            shared.permission?.permission_id || shared.folder?.folder_id
          }`}
        >
          {shared.type === "document" ? (
            <SharedDocumentItem
              sharedDocument={shared}
              viewMode="grid"
              onClick={() => onPreview(shared.document)}
              onContextMenu={(e) => onContextMenu(e, shared, "shared-document")}
            />
          ) : (
            <SharedFolderItem
              sharedFolder={shared}
              viewMode="grid"
              onClick={async () => await onNavigateToSharedFolder(shared)}
              onContextMenu={(e) => onContextMenu(e, shared, "shared-folder")}
            />
          )}
        </motion.div>
      ))}
    </motion.div>
  );
};

export default DocumentsContent;
