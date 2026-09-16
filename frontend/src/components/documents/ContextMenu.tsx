import React, { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FiFolder,
  FiDownload,
  FiShare2,
  FiEdit2,
  FiTrash2,
  FiUpload,
  FiFolderPlus,
  FiEye,
} from "react-icons/fi";
import type { Folder, Document, SharedDocument } from "../../api/documents";

interface ContextMenuProps {
  contextMenu: {
    x: number;
    y: number;
    item: Folder | Document | SharedDocument | any | null;
    type:
      | "folder"
      | "document"
      | "shared-document"
      | "shared-folder"
      | "background";
  } | null;
  activeTab: "my-documents" | "shared-with-me";
  isInSharedFolder?: boolean;
  onNavigateToFolder: (folder: Folder) => void;
  onNavigateToSharedFolder: (sharedFolder: any) => void;
  onDownload: (doc: Document) => void;
  onOpenShareModal: (item: Folder | Document) => void;
  onOpenRenameModal: (item: Folder | Document) => void;
  onOpenPreviewModal: (doc: Document) => void;
  onOpenSharedDetailsModal: (sharedDoc: SharedDocument) => void;
  onDelete: (item: Folder | Document) => void;
  onRemoveSharedAccess: (sharedDoc: SharedDocument) => void;
  onRemoveSharedFolderAccess: (sharedFolder: any) => void;
  onCreateFolder: () => void;
  onUploadFiles: () => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  contextMenu,
  activeTab,
  isInSharedFolder = false,
  onNavigateToFolder,
  onNavigateToSharedFolder,
  onDownload,
  onOpenShareModal,
  onOpenRenameModal,
  onOpenPreviewModal,
  onOpenSharedDetailsModal,
  onDelete,
  onRemoveSharedAccess,
  onRemoveSharedFolderAccess,
  onCreateFolder,
  onUploadFiles,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x: 0, y: 0 });

  // Always call hooks in the same order
  useEffect(() => {
    if (contextMenu && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = contextMenu.x;
      let adjustedY = contextMenu.y;

      // Check if menu goes off the right edge
      if (contextMenu.x + menuRect.width > viewportWidth) {
        adjustedX = contextMenu.x - menuRect.width;
      }

      // Check if menu goes off the bottom edge
      if (contextMenu.y + menuRect.height > viewportHeight) {
        adjustedY = contextMenu.y - menuRect.height;
      }

      // Ensure menu doesn't go off the left edge
      if (adjustedX < 0) {
        adjustedX = 10; // Small margin from left edge
      }

      // Ensure menu doesn't go off the top edge
      if (adjustedY < 0) {
        adjustedY = 10; // Small margin from top edge
      }

      setAdjustedPosition({ x: adjustedX, y: adjustedY });
    }
  }, [contextMenu]);

  if (!contextMenu) return null;

  const { item, type } = contextMenu;

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-48 overflow-hidden"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {type === "folder" && item && (() => {
        // isInSharedFolder only tells us whether we're currently *browsing
        // inside* a shared folder — it says nothing about a shared folder
        // sitting right in the root "My Documents" listing (merged in via
        // is_shared) that the caller doesn't own but hasn't navigated into
        // yet. Check the item itself too, or Rename/Delete/Share would show
        // for a folder that isn't the caller's to rename, delete, or share.
        const folderItem = item as Folder;
        const isOthersFolder = isInSharedFolder || folderItem.is_shared === true;
        const canEditThisFolder =
          !isOthersFolder ||
          folderItem.permission_type === "EDIT" ||
          folderItem.permission_type === "SHARE";
        // shareFolder is currently owner-only on the backend (a SHARE
        // permission grant doesn't let its holder re-share yet), so don't
        // offer a Share action here that would just fail server-side.
        const canShareThisFolder = !isOthersFolder;
        return (
        <>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onNavigateToFolder(item as Folder);
              onClose();
            }}
            className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <FiFolder className="w-4 h-4 text-blue-500" />
            Open
          </motion.button>
          {canShareThisFolder && (
            <motion.button
              whileHover={{ x: 5 }}
              onClick={() => {
                onOpenShareModal(item as Folder);
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <FiShare2 className="w-4 h-4 text-blue-500" />
              Share
            </motion.button>
          )}
          {canEditThisFolder && (
            <motion.button
              whileHover={{ x: 5 }}
              onClick={() => {
                onOpenRenameModal(item as Folder);
                onClose();
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <FiEdit2 className="w-4 h-4 text-gray-400" />
              Rename
            </motion.button>
          )}
          {!isOthersFolder && (
            <motion.button
              whileHover={{ x: 5 }}
              onClick={() => {
                onDelete(item as Folder);
              }}
              className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
            >
              <FiTrash2 className="w-4 h-4" />
              Delete
            </motion.button>
          )}
        </>
        );
      })()}
      {type === "document" && item && (
        <>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onOpenPreviewModal(item as Document);
              onClose();
            }}
            className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <FiEye className="w-4 h-4 text-purple-500" />
            Preview
          </motion.button>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onDownload(item as Document);
              onClose();
            }}
            className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <FiDownload className="w-4 h-4 text-green-500" />
            Download
          </motion.button>
          {!isInSharedFolder && (
            <>
              <motion.button
                whileHover={{ x: 5 }}
                onClick={() => {
                  onOpenShareModal(item as Document);
                }}
                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
              >
                <FiShare2 className="w-4 h-4 text-blue-500" />
                Share
              </motion.button>
              <motion.button
                whileHover={{ x: 5 }}
                onClick={() => {
                  onOpenRenameModal(item as Document);
                  onClose();
                }}
                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
              >
                <FiEdit2 className="w-4 h-4 text-gray-400" />
                Rename
              </motion.button>
            </>
          )}
          {!isInSharedFolder && (
            <motion.button
              whileHover={{ x: 5 }}
              onClick={() => {
                onDelete(item as Document);
              }}
              className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
            >
              <FiTrash2 className="w-4 h-4" />
              Delete
            </motion.button>
          )}
        </>
      )}
      {type === "shared-document" && item && (
        <>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onDownload((item as SharedDocument).document);
              onClose();
            }}
            className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <FiDownload className="w-4 h-4 text-green-500" />
            Download
          </motion.button>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onRemoveSharedAccess(item as SharedDocument);
            }}
            className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
          >
            <FiTrash2 className="w-4 h-4" />
            Remove
          </motion.button>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onOpenSharedDetailsModal(item as SharedDocument);
              onClose();
            }}
            className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <FiEye className="w-4 h-4 text-blue-500" />
            View Details
          </motion.button>
        </>
      )}
      {type === "shared-folder" && item && (
        <>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              // Navigate to shared folder
              onNavigateToSharedFolder(item);
              onClose();
            }}
            className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <FiFolder className="w-4 h-4 text-blue-500" />
            Open
          </motion.button>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onRemoveSharedFolderAccess(item);
            }}
            className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
          >
            <FiTrash2 className="w-4 h-4" />
            Remove Access
          </motion.button>
        </>
      )}
      {type === "background" && activeTab === "my-documents" && (
        <>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onCreateFolder();
              onClose();
            }}
            className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <FiFolderPlus className="w-4 h-4 text-blue-500" />
            New Folder
          </motion.button>
          <motion.button
            whileHover={{ x: 5 }}
            onClick={() => {
              onUploadFiles();
              onClose();
            }}
            className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
          >
            <FiUpload className="w-4 h-4 text-green-500" />
            Upload Files
          </motion.button>
        </>
      )}
    </motion.div>
  );
};

export default ContextMenu;
