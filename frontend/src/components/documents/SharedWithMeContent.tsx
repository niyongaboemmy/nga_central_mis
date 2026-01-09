import React from "react";
import { motion } from "framer-motion";
import { FiUsers } from "react-icons/fi";
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

interface SharedWithMeContentProps {
  isLoadingShared: boolean;
  viewMode: ViewMode;
  filteredSharedDocuments: SharedDocument[];
  filteredSharedFolders: any[];
  sortBy: SortOption;
  sortOrder: "asc" | "desc";
  currentSharedFolder: any | null;
  folders: Folder[];
  filteredDocuments: Document[];
  onNavigateToSharedFolder: (sharedFolder: any) => Promise<void>;
  onNavigateToSharedSubFolder: (folder: Folder) => Promise<void>;
  onPreview: (doc: Document) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: SharedDocument | any,
    type: "shared-document" | "shared-folder" | "folder" | "document"
  ) => void;
}

const SharedWithMeContent: React.FC<SharedWithMeContentProps> = ({
  isLoadingShared,
  viewMode,
  filteredSharedDocuments,
  filteredSharedFolders,
  sortBy,
  sortOrder,
  currentSharedFolder,
  folders,
  filteredDocuments,
  onNavigateToSharedFolder,
  onNavigateToSharedSubFolder,
  onPreview,
  onContextMenu,
}) => {
  if (isLoadingShared) {
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

  // Empty state for shared documents
  if (
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

  // Shared with me view when inside a shared folder
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
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4"
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
              <div className="hidden sm:flex w-20">Size</div>
              <div className="hidden sm:flex w-16">Type</div>
              <div className="hidden sm:flex w-24">Modified</div>
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
            <div className="hidden sm:flex w-20">Shared by</div>
            <div className="hidden sm:flex w-16">Items</div>
            <div className="hidden sm:flex w-20">Permission</div>
            <div className="hidden sm:flex w-24">Date Shared</div>
            <div className="w-8"></div>
          </div>
        </div>

        {/* List items */}
        <div className="divide-y divide-gray-100 dark:divide-gray-700/20">
          {allSharedItems.map((shared, index) => (
            <div key={`shared-${shared.type}-${index + 1}`}>
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

export default SharedWithMeContent;
