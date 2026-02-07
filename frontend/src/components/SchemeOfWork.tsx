import React, { useState } from "react";
import { apiService } from "../services/api";
import { useToast } from "../contexts/ToastContext";
import {
  CloudUpload,
  FileText,
  Table as TableIcon,
  Trash2,
  Eye,
  Loader2,
} from "lucide-react";

const SchemeOfWork: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { showToast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith(".docx")) {
        setFile(selectedFile);
        setPreviewHtml(null);
      } else {
        showToast("Please select a .docx file", "error");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await apiService.post(
        "/documents/scheme-of-work/preview",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      setPreviewHtml(response.data.data.html);
      showToast("Scheme of work parsed successfully", "success");
    } catch (error: any) {
      console.error("Upload error:", error);
      showToast(
        error.response?.data?.message || "Failed to parse document",
        "error",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setPreviewHtml(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary-light dark:text-text-primary-dark flex items-center gap-3">
          <FileText className="h-8 w-8 text-blue-600" />
          Scheme of Work Builder
        </h1>
        <p className="text-text-secondary-light dark:text-text-secondary-dark/70 mt-2">
          Upload your Scheme of Work document (.docx) to preview it in digital
          format.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-background-dark-secondary p-6 rounded-2xl shadow-sm border border-border-light dark:border-border-dark/50">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-text-primary-light dark:text-text-primary-dark">
              <CloudUpload className="h-5 w-5 text-blue-500" />
              Upload Document
            </h2>

            {!file ? (
              <label className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <CloudUpload className="h-10 w-10 text-gray-400 group-hover:text-blue-500 transition-colors mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-semibold">Click to upload</span> or
                    drag and drop
                  </p>
                  <p className="text-xs text-gray-400 mt-1">DOCX only</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".docx"
                  onChange={handleFileChange}
                />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                  <FileText className="h-10 w-10 text-blue-600 mr-3" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>

                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Eye className="h-5 w-5" />
                      Preview Content
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-100 dark:border-amber-800/30">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-2 mb-1">
              <TableIcon className="h-4 w-4" />
              Tip: Table Layouts
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-500/80 leading-relaxed">
              For best results, ensure your document uses standard Word tables.
              Complex nested tables might be simplified during conversion.
            </p>
          </div>
        </div>

        {/* Preview Section */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-background-dark-secondary rounded-2xl shadow-sm border border-border-light dark:border-border-dark/50 overflow-hidden min-h-[600px]">
            <div className="px-6 py-4 border-b border-border-light dark:border-border-dark/50 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h2 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark flex items-center gap-2">
                <Eye className="h-5 w-5 text-green-500" />
                Document Preview
              </h2>
            </div>

            <div className="p-8">
              {previewHtml ? (
                <div
                  className="scheme-preview-content prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
                  <TableIcon className="h-16 w-16 mb-4 opacity-20" />
                  <p>
                    Upload a file to see a preview of its tables and content
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .scheme-preview-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
          font-size: 0.875rem;
          border: 1px solid #e5e7eb;
        }
        .dark .scheme-preview-content table {
          border-color: #374151;
        }
        .scheme-preview-content th, 
        .scheme-preview-content td {
          padding: 0.75rem;
          border: 1px solid #e5e7eb;
          text-align: left;
        }
        .dark .scheme-preview-content th, 
        .dark .scheme-preview-content td {
          border-color: #374151;
        }
        .scheme-preview-content th {
          background-color: #f9fafb;
          font-weight: 600;
          color: #111827;
        }
        .dark .scheme-preview-content th {
          background-color: #1f2937;
          color: #f9fafb;
        }
        .scheme-preview-content p {
          margin-bottom: 0.5rem;
        }
      `}</style>
    </div>
  );
};

export default SchemeOfWork;
