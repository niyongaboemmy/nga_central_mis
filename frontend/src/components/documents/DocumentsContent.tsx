import React from "react";
import { motion } from "framer-motion";
import {
  FiFolder,
  FiUsers,
  FiMoreVertical,
  FiUser,
  FiFile,
  FiImage,
  FiVideo,
  FiMusic,
  FiFileText,
  FiArchive,
  FiCode,
  FiFilePlus,
} from "react-icons/fi";
import {
  formatFileSize,
  getFileTypeColor,
  type Folder,
  type Document,
  type SharedDocument,
} from "../../api/documents";
import {
  containerVariants,
  itemVariants,
  getItemKey,
  type ViewMode,
  type SortOption,
} from "./types";

// Type guard to check if item is a folder
const itemIsFolder = (item: Folder | Document): item is Folder => {
  return (
    (item as Folder).folder_id !== undefined &&
    (item as Folder).parent_folder_id !== undefined
  );
};

// Get file icon component helper
const getFileIconComponent = (doc: Document, size: number = 48) => {
  const colorClass = getFileTypeColor(doc.mime_type, doc.file_extension);
  const iconProps = {
    className: `${size === 48 ? "w-12 h-12" : "w-5 h-5"} ${colorClass}`,
  };
  const ext = doc.file_extension.toLowerCase();

  switch (true) {
    case doc.mime_type.startsWith("image/"):
      return <FiImage {...iconProps} />;
    case doc.mime_type.startsWith("video/"):
      return <FiVideo {...iconProps} />;
    case doc.mime_type.startsWith("audio/"):
      return <FiMusic {...iconProps} />;
    case ext === "pdf":
      return <FiFileText {...iconProps} />;
    case ["doc", "docx"].includes(ext):
      return <FiFilePlus {...iconProps} />;
    case ["xls", "xlsx", "csv"].includes(ext):
      return <FiFileText {...iconProps} />;
    case ["ppt", "pptx"].includes(ext):
      return <FiFileText {...iconProps} />;
    case ["zip", "rar", "7z", "tar", "gz"].includes(ext):
      return <FiArchive {...iconProps} />;
    case ["js", "ts", "html", "css", "json", "py", "java", "c", "cpp"].includes(
      ext
    ):
      return <FiCode {...iconProps} />;
    default:
      return <FiFile {...iconProps} />;
  }
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
  onNavigateToFolder: (folder: Folder) => void;
  onPreview: (doc: Document) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: Folder | Document | SharedDocument,
    type: "folder" | "document" | "shared-document"
  ) => void;
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
  onNavigateToFolder,
  onPreview,
  onContextMenu,
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

  // Get display name for item
  const getItemName = (item: Folder | Document) => {
    return itemIsFolder(item) ? item.name : item.original_name;
  };

  // Get date for item
  const getItemDate = (item: Folder | Document) => {
    return item.created_at;
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
          This folder is empty
        </p>
        <p className="text-sm mt-2">Upload files or create a new folder</p>
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
          <motion.div
            key={i + 1}
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onContextMenu={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onContextMenu(
                e,
                item,
                itemIsFolder(item) ? "folder" : "document"
              );
            }}
            onClick={() => {
              if (itemIsFolder(item)) {
                onNavigateToFolder(item);
              } else {
                onPreview(item);
              }
            }}
            className="p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-xl border-gray-200 dark:border-gray-700/20 bg-white dark:bg-gray-800/40 hover:border-blue-300 dark:hover:border-blue-500"
          >
            <div className="flex flex-col items-center text-center">
              {itemIsFolder(item) ? (
                <motion.div
                  whileHover={{ rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <FiFolder
                    className="w-14 h-14 mb-3"
                    style={{ color: item.color }}
                  />
                </motion.div>
              ) : (
                <div className="mb-3 transform hover:scale-110 transition-transform duration-200">
                  {getFileIconComponent(item)}
                </div>
              )}
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate w-full px-2">
                {getItemName(item)}
              </p>
              {itemIsFolder(item) ? (
                <p className="text-xs text-gray-400 mt-1">Folder</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">
                  {formatFileSize(item.file_size)}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>
    ) : (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full"
      >
        {/* Desktop table header */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 text-left text-sm text-gray-500 border-b border-gray-200 dark:border-gray-700/20 bg-gray-50 dark:bg-gray-800/50 rounded-t-lg">
          <div className="col-span-6">Name</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Modified</div>
          <div className="w-12"></div>
        </div>

        {/* List items */}
        <div className="space-y-2">
          {sortedItems.map((item, index) => (
            <motion.div
              key={getItemKey(item)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              onContextMenu={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onContextMenu(
                  e,
                  item,
                  itemIsFolder(item) ? "folder" : "document"
                );
              }}
              onClick={() => {
                if (itemIsFolder(item)) {
                  onNavigateToFolder(item);
                } else {
                  onPreview(item);
                }
              }}
              className="cursor-pointer rounded-xl border transition-all hover:shadow-md border-gray-200 dark:border-gray-700/20 bg-white dark:bg-gray-800/40 hover:border-blue-300 dark:hover:border-blue-500"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 items-center">
                {/* Name column */}
                <div className="col-span-1 md:col-span-6 flex items-center gap-3 min-w-0">
                  {itemIsFolder(item) ? (
                    <motion.div whileHover={{ rotate: 5 }}>
                      <FiFolder
                        className="w-5 h-5 flex-shrink-0"
                        style={{ color: item.color }}
                      />
                    </motion.div>
                  ) : (
                    <div className="w-5 h-5 flex-shrink-0 transform hover:scale-110 transition-transform">
                      {getFileIconComponent(item, 20)}
                    </div>
                  )}
                  <span className="font-medium text-gray-700 dark:text-gray-200 truncate">
                    {getItemName(item)}
                  </span>
                </div>

                {/* Size column */}
                <div className="hidden md:block col-span-2 text-sm text-gray-500">
                  {itemIsFolder(item) ? "—" : formatFileSize(item.file_size)}
                </div>

                {/* Type column */}
                <div className="hidden md:block col-span-2 text-sm text-gray-500">
                  {itemIsFolder(item)
                    ? "File folder"
                    : item.file_extension.toUpperCase()}
                </div>

                {/* Modified column */}
                <div className="flex md:hidden text-xs text-gray-400">
                  {itemIsFolder(item)
                    ? ""
                    : `${formatFileSize(
                        item.file_size
                      )} - ${item.file_extension.toUpperCase()}`}
                </div>
                <div className="hidden md:block col-span-2 text-sm text-gray-500">
                  {new Date(getItemDate(item)).toLocaleDateString()}
                </div>

                {/* Actions column */}
                <div className="flex md:col-span-1 justify-end">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onContextMenu(
                        e,
                        item,
                        itemIsFolder(item) ? "folder" : "document"
                      );
                    }}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <FiMoreVertical className="w-4 h-4 text-gray-400" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Shared with me view
  const allSharedItems = [
    ...filteredSharedDocuments.map((item) => ({ ...item, type: "document" })),
    ...filteredSharedFolders.map((item) => ({ ...item, type: "folder" })),
  ];

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
          // variants={itemVariants}
          whileHover={{ scale: 1.03, y: -5 }}
          whileTap={{ scale: 0.98 }}
          onContextMenu={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onContextMenu(
              e,
              shared,
              shared.type === "document" ? "shared-document" : "folder"
            );
          }}
          onClick={() => {
            if (shared.type === "document") {
              onPreview(shared.document);
            } else {
              // Handle folder click - perhaps navigate or show details
            }
          }}
          className="p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-xl border-gray-200 dark:border-gray-700/20 bg-white dark:bg-gray-800/40 hover:border-blue-300 dark:hover:border-blue-500"
        >
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 transform hover:scale-110 transition-transform duration-200">
              {shared.type === "document" ? (
                getFileIconComponent(shared.document)
              ) : (
                <FiFolder className="w-12 h-12 text-blue-500" />
              )}
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate w-full px-2">
              {shared.type === "document"
                ? shared.document.original_name
                : shared.folder.name}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <FiUser className="w-3 h-3 text-gray-400" />
              <p className="text-xs text-gray-400">
                {shared.permission?.shared_by_user
                  ? `${shared.permission.shared_by_user.first_name || ""} ${
                      shared.permission.shared_by_user.last_name || ""
                    }`.trim() || shared.permission.shared_by_user.username
                  : "Unknown"}
              </p>
            </div>
            <span
              className={`text-xs mt-1 px-2 py-0.5 rounded-full ${
                shared.permission?.permission_type === "VIEW"
                  ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  : shared.permission?.permission_type === "EDIT"
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
              }`}
            >
              {shared.permission?.permission_type || "VIEW"}
            </span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default DocumentsContent;
