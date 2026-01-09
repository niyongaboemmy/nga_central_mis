import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FiX,
  FiDownload,
  FiFile,
  FiImage,
  FiFileText,
  FiCode,
  FiArchive,
  FiVideo,
  FiMusic,
  FiAlertCircle,
  FiZoomIn,
  FiZoomOut,
  FiRotateCcw,
} from "react-icons/fi";
import { documentApi, type Document } from "../../api/documents";
import { modalVariants } from "./types";

interface DocumentPreviewModalProps {
  isOpen: boolean;
  document: Document | null;
  onClose: () => void;
}

const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  document: doc,
  onClose,
}) => {
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Reset state when modal opens/closes or document changes
  useEffect(() => {
    if (isOpen && doc) {
      setPreviewContent(null);
      setError(null);
      setZoom(1);
      setRotation(0);
      loadPreview();
    }
  }, [isOpen, doc]);

  const loadPreview = async () => {
    if (!doc) return;

    setIsLoading(true);
    setError(null);

    try {
      const fileExtension = doc.file_extension.toLowerCase();
      const mimeType = doc.mime_type;

      // For images, PDFs, and text files, try to get preview content
      if (
        mimeType.startsWith("image/") ||
        mimeType === "application/pdf" ||
        ["txt", "md", "json", "xml", "csv"].includes(fileExtension) ||
        [
          "js",
          "ts",
          "html",
          "css",
          "scss",
          "less",
          "py",
          "java",
          "cpp",
          "c",
          "php",
          "rb",
          "go",
          "rs",
        ].includes(fileExtension)
      ) {
        const response = await documentApi.download(doc.document_id);
        const blob = new Blob([response.data], { type: mimeType });

        if (mimeType.startsWith("image/")) {
          const url = URL.createObjectURL(blob);
          setPreviewContent(url);
        } else if (mimeType === "application/pdf") {
          const url = URL.createObjectURL(blob);
          setPreviewContent(url);
        } else {
          // Text-based files
          const text = await blob.text();
          setPreviewContent(text);
        }
      } else {
        // For other file types, just show file info
        setPreviewContent(null);
      }
    } catch (err: any) {
      console.error("Failed to load preview:", err);
      setError(
        err.response?.data?.message || "Failed to load document preview"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!doc) return;

    try {
      const response = await documentApi.download(doc.document_id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = window.document.createElement("a");
      link.href = url;
      link.setAttribute("download", doc.original_name);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const getFileIcon = () => {
    if (!doc) return <FiFile className="w-8 h-8 text-gray-400" />;

    const mimeType = doc.mime_type;
    const ext = doc.file_extension.toLowerCase();

    if (mimeType.startsWith("image/")) {
      return <FiImage className="w-8 h-8 text-blue-500" />;
    }
    if (mimeType === "application/pdf") {
      return <FiFileText className="w-8 h-8 text-red-500" />;
    }
    if (
      [
        "js",
        "ts",
        "html",
        "css",
        "scss",
        "less",
        "py",
        "java",
        "cpp",
        "c",
        "php",
        "rb",
        "go",
        "rs",
      ].includes(ext)
    ) {
      return <FiCode className="w-8 h-8 text-yellow-500" />;
    }
    if (["txt", "md", "json", "xml", "csv"].includes(ext)) {
      return <FiFileText className="w-8 h-8 text-gray-500" />;
    }
    if (mimeType.startsWith("video/")) {
      return <FiVideo className="w-8 h-8 text-red-500" />;
    }
    if (mimeType.startsWith("audio/")) {
      return <FiMusic className="w-8 h-8 text-purple-500" />;
    }
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
      return <FiArchive className="w-8 h-8 text-gray-600" />;
    }

    return <FiFile className="w-8 h-8 text-gray-400" />;
  };

  const renderPreview = () => {
    if (!doc) return null;

    const mimeType = doc.mime_type;
    const ext = doc.file_extension.toLowerCase();

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <FiAlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">
            Preview Unavailable
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Download File
          </button>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      );
    }

    if (mimeType.startsWith("image/") && previewContent) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-white transition-colors"
              title="Zoom Out"
            >
              <FiZoomOut className="w-4 h-4" />
            </button>
            <span className="px-3 py-2 bg-gray-100 dark:bg-gray-700 dark:text-white rounded-lg text-sm">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-white transition-colors"
              title="Zoom In"
            >
              <FiZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setRotation((rotation + 90) % 360)}
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-white transition-colors"
              title="Rotate"
            >
              <FiRotateCcw className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center">
            <img
              src={previewContent}
              alt={doc.original_name}
              className="max-w-full max-h-full object-contain"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: "transform 0.2s ease",
              }}
            />
          </div>
        </div>
      );
    }

    if (mimeType === "application/pdf" && previewContent) {
      return (
        <div className="h-full">
          <iframe
            src={previewContent}
            className="w-full h-full border-0"
            title={doc.original_name}
          />
        </div>
      );
    }

    if (["txt", "md", "json", "xml", "csv"].includes(ext) && previewContent) {
      return (
        <div className="h-full overflow-auto p-4">
          <pre className="whitespace-pre-wrap text-sm font-mono text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            {previewContent}
          </pre>
        </div>
      );
    }

    if (
      [
        "js",
        "ts",
        "html",
        "css",
        "scss",
        "less",
        "py",
        "java",
        "cpp",
        "c",
        "php",
        "rb",
        "go",
        "rs",
      ].includes(ext) &&
      previewContent
    ) {
      return (
        <div className="h-full overflow-auto p-4">
          <pre className="whitespace-pre-wrap text-sm font-mono text-gray-700 dark:text-gray-200 bg-gray-900 p-4 rounded-lg overflow-x-auto">
            <code>{previewContent}</code>
          </pre>
        </div>
      );
    }

    // Default: Show file info
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="mb-6">{getFileIcon()}</div>
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-2">
          {doc.original_name}
        </h3>
        <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1 mb-6">
          <p>Size: {formatFileSize(doc.file_size)}</p>
          <p>Type: {doc.file_extension.toUpperCase()}</p>
          <p>MIME: {doc.mime_type}</p>
        </div>
        <button
          onClick={handleDownload}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <FiDownload className="w-4 h-4" />
          Download File
        </button>
      </div>
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (!isOpen || !doc) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            {getFileIcon()}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 truncate">
                {doc.original_name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatFileSize(doc.file_size)} •{" "}
                {doc.file_extension.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Download"
            >
              <FiDownload className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Close"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">{renderPreview()}</div>
      </motion.div>
    </motion.div>
  );
};

export default DocumentPreviewModal;
