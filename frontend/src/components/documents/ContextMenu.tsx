import React from "react";
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
  onNavigateToFolder: (folder: Folder) => void;
  onDownload: (doc: Document) => void;
  onOpenShareModal: (item: Folder | Document) => void;
  onOpenRenameModal: (item: Folder | Document) => void;
  onOpenPreviewModal: (doc: Document) => void;
  onOpenSharedDetailsModal: (sharedDoc: SharedDocument) => void;
  onDelete: (item: Folder | Document) => void;
  onRemoveSharedAccess: (sharedDoc: SharedDocument) => void;
  onCreateFolder: () => void;
  onUploadFiles: () => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  contextMenu,
  activeTab,
  onNavigateToFolder,
  onDownload,
  onOpenShareModal,
  onOpenRenameModal,
  onOpenPreviewModal,
  onOpenSharedDetailsModal,
  onDelete,
  onRemoveSharedAccess,
  onCreateFolder,
  onUploadFiles,
  onClose,
}) => {
  if (!contextMenu) return null;

  const { x, y, item, type } = contextMenu;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-48 overflow-hidden"
      style={{ left: x, top: y }}
    >
      {type === "folder" && item && (
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
        </>
      )}
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
              onNavigateToFolder(item.folder);
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
              // Remove shared folder access - need to implement this
              onClose();
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
