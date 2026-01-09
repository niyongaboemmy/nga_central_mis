import React from "react";
import {
  FiUser,
  FiCalendar,
  FiShield,
  FiClock,
  FiEye,
  FiDownload,
} from "react-icons/fi";
import { SharedDocument, Document } from "../../api/documents";
import { formatFileSize } from "../../api/documents";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

interface SharedDocumentDetailsModalProps {
  isOpen: boolean;
  sharedDocument: SharedDocument | null;
  onClose: () => void;
  onPreview: (document: Document) => void;
  onDownload: (document: Document) => void;
}

const SharedDocumentDetailsModal: React.FC<SharedDocumentDetailsModalProps> = ({
  isOpen,
  sharedDocument,
  onClose,
  onPreview,
  onDownload,
}) => {
  const { document: doc, permission } = sharedDocument || {};
  const sharedBy = permission?.shared_by_user;

  const handlePreview = () => {
    if (doc) {
      onPreview(doc);
      onClose();
    }
  };

  const handleDownload = () => {
    if (doc) {
      onDownload(doc);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Document Details" size="lg">
      <div className="space-y-4">
        {/* Document Info */}
        {doc && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
            <h3 className="font-medium text-gray-700 dark:text-gray-200 mb-2">
              {doc.original_name}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
              <div>Size: {formatFileSize(doc.file_size)}</div>
              <div>Type: {doc.file_extension.toUpperCase()}</div>
              <div className="col-span-2">
                Uploaded: {new Date(doc.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        )}

        {/* Sharing Info */}
        {sharedBy && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FiUser className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Shared by
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <div className="font-medium">
                {sharedBy.first_name} {sharedBy.last_name}
              </div>
              <div>{sharedBy.email}</div>
            </div>
          </div>
        )}

        {/* Permission Info */}
        {permission && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FiShield className="w-4 h-4 text-green-500" />
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Permissions
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <div className="font-medium capitalize">
                {permission.permission_type.toLowerCase()}
              </div>
            </div>
          </div>
        )}

        {/* Dates */}
        {permission && (
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FiCalendar className="w-4 h-4 text-purple-500" />
              <span className="font-medium text-gray-700 dark:text-gray-200">
                Sharing Details
              </span>
            </div>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <FiClock className="w-4 h-4" />
                <span>
                  Shared on:{" "}
                  {new Date(permission.created_at).toLocaleDateString()}
                </span>
              </div>
              {permission.expires_at && (
                <div className="flex items-center gap-2">
                  <FiClock className="w-4 h-4" />
                  <span>
                    Expires:{" "}
                    {new Date(permission.expires_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="secondary"
            onClick={handlePreview}
            disabled={!doc}
            className="flex items-center gap-2"
          >
            <FiEye className="w-4 h-4" />
            Preview
          </Button>
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={!doc}
            className="flex items-center gap-2"
          >
            <FiDownload className="w-4 h-4" />
            Download
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default SharedDocumentDetailsModal;
