import React from "react";
import { motion } from "framer-motion";
import { modalVariants } from "./types";

interface CreateFolderModalProps {
  isOpen: boolean;
  folderName: string;
  onFolderNameChange: (name: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  folderName,
  onFolderNameChange,
  onCreate,
  onClose,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isOpen ? 1 : 0 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-opacity duration-200 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate={isOpen ? "visible" : "hidden"}
        exit="exit"
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4">
          Create New Folder
        </h2>
        <motion.input
          whileFocus={{ scale: 1.02 }}
          type="text"
          value={folderName}
          onChange={(e) => onFolderNameChange(e.target.value)}
          placeholder="Folder name"
          className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 transition-all"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
        />
        <div className="flex justify-end gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
          >
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreate}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/30 transition-all"
          >
            Create
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CreateFolderModal;
