import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen,
  Plus,
  Upload,
  Trash2,
  Download,
  File,
  FileText,
  Image,
  Archive,
  Loader2,
  Pencil,
  FolderPlus,
  CloudUpload,
  Eye,
  Search,
  ArrowUpDown,
  X,
} from "lucide-react";
import {
  subjectDocCategoriesApi,
  subjectDocumentsApi,
  SubjectDocCategory,
  SubjectDoc,
} from "../../api/curriculum";
import { useToast } from "../../contexts/ToastContext";
import usePermissions from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";
import CategoryFormModal from "./CategoryFormModal";
import DocumentPreviewModal from "../documents/DocumentPreviewModal";

interface SubjectMaterialsTabProps {
  subjectId: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(ext: string) {
  const e = ext.toLowerCase();
  if (["pdf", "doc", "docx", "txt", "odt"].includes(e))
    return FileText;
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(e))
    return Image;
  if (["zip", "rar", "7z", "tar", "gz"].includes(e))
    return Archive;
  return File;
}

const SubjectMaterialsTab: React.FC<SubjectMaterialsTabProps> = ({
  subjectId,
}) => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permissions.MANAGE_CURRICULUM);
  const canUpload = hasPermission(Permissions.UPLOAD_SUBJECT_DOCUMENTS);

  const [categories, setCategories] = useState<SubjectDocCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null,
  );
  const [documents, setDocuments] = useState<SubjectDoc[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [deletingCatId, setDeletingCatId] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SubjectDoc | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<SubjectDocCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    loadCategories();
  }, [subjectId]);

  useEffect(() => {
    if (selectedCategoryId !== null) loadDocuments(selectedCategoryId);
    else setDocuments([]);
  }, [selectedCategoryId]);

  const loadCategories = async () => {
    try {
      const res = await subjectDocCategoriesApi.getAll(subjectId);
      const cats = res.data.data || [];
      setCategories(cats);
      if (cats.length > 0 && selectedCategoryId === null) {
        setSelectedCategoryId(cats[0].category_id);
      }
    } catch {
      showToast("Failed to load categories", "error");
    } finally {
      setLoadingCats(false);
    }
  };

  const loadDocuments = async (categoryId: number) => {
    setLoadingDocs(true);
    try {
      const res = await subjectDocumentsApi.getAll(subjectId, categoryId);
      setDocuments(res.data.data || []);
    } catch {
      showToast("Failed to load documents", "error");
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleCategorySaved = (saved: SubjectDocCategory) => {
    setCategories((prev) => {
      const idx = prev.findIndex(
        (c) => c.category_id === saved.category_id,
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = saved;
        return updated;
      }
      return [...prev, saved];
    });
    if (selectedCategoryId === null) {
      setSelectedCategoryId(saved.category_id);
    }
  };

  const handleDeleteCategory = async (cat: SubjectDocCategory) => {
    if (
      !window.confirm(
        `Delete category "${cat.name}" and all ${cat.document_count} document(s) inside?`,
      )
    )
      return;
    setDeletingCatId(cat.category_id);
    try {
      await subjectDocCategoriesApi.delete(cat.category_id);
      setCategories((prev) =>
        prev.filter((c) => c.category_id !== cat.category_id),
      );
      if (selectedCategoryId === cat.category_id) {
        const remaining = categories.filter(
          (c) => c.category_id !== cat.category_id,
        );
        setSelectedCategoryId(
          remaining.length > 0 ? remaining[0].category_id : null,
        );
      }
      showToast("Category deleted", "success");
    } catch {
      showToast("Failed to delete category", "error");
    } finally {
      setDeletingCatId(null);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!selectedCategoryId) {
      showToast("Select a category first", "error");
      return;
    }
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("categoryId", String(selectedCategoryId));
        const res = await subjectDocumentsApi.upload(subjectId, fd);
        const created: SubjectDoc = res.data.data;
        setDocuments((prev) => [created, ...prev]);
        setCategories((prev) =>
          prev.map((c) =>
            c.category_id === selectedCategoryId
              ? { ...c, document_count: Number(c.document_count) + 1 }
              : c,
          ),
        );
        successCount++;
      } catch {
        showToast(`Failed to upload ${file.name}`, "error");
      }
    }
    if (successCount > 0) {
      showToast(
        `${successCount} file${successCount > 1 ? "s" : ""} uploaded`,
        "success",
      );
    }
    setUploading(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      uploadFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDraggingOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleDownload = async (doc: SubjectDoc) => {
    try {
      const res = await subjectDocumentsApi.download(doc.document_id);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.original_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Failed to download file", "error");
    }
  };

  const handleDeleteDocument = async (doc: SubjectDoc) => {
    if (!window.confirm(`Delete "${doc.original_name}"?`)) return;
    setDeletingDocId(doc.document_id);
    try {
      await subjectDocumentsApi.delete(doc.document_id);
      setDocuments((prev) =>
        prev.filter((d) => d.document_id !== doc.document_id),
      );
      setCategories((prev) =>
        prev.map((c) =>
          c.category_id === doc.category_id
            ? { ...c, document_count: Math.max(0, Number(c.document_count) - 1) }
            : c,
        ),
      );
      showToast("Document deleted", "success");
    } catch {
      showToast("Failed to delete document", "error");
    } finally {
      setDeletingDocId(null);
    }
  };

  const selectedCategory = categories.find(
    (c) => c.category_id === selectedCategoryId,
  );

  useEffect(() => {
    setSearchQuery("");
  }, [selectedCategoryId]);

  const visibleDocuments = useMemo(() => {
    const filtered = searchQuery.trim()
      ? documents.filter((d) =>
          d.original_name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
        )
      : documents;
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.original_name.localeCompare(b.original_name);
      if (sortBy === "size") return b.file_size - a.file_size;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    return sorted;
  }, [documents, searchQuery, sortBy]);

  if (loadingCats) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[50vh]">
      {/* Category sidebar */}
      <div className="lg:w-56 flex-shrink-0">
        <div className="bg-white dark:bg-gray-800/30 dark:backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-700/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700/20">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Categories
            </span>
            {canManage && (
              <button
                onClick={() => {
                  setEditingCategory(null);
                  setShowCategoryModal(true);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                title="New category"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            )}
          </div>

          {categories.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FolderOpen className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No categories yet
              </p>
              {canManage && (
                <button
                  onClick={() => {
                    setEditingCategory(null);
                    setShowCategoryModal(true);
                  }}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Create one
                </button>
              )}
            </div>
          ) : (
            <ul className="py-2">
              {categories.map((cat) => {
                const isSelected = selectedCategoryId === cat.category_id;
                const isDeleting = deletingCatId === cat.category_id;
                return (
                  <li key={cat.category_id} className="group/cat relative px-2">
                    <button
                      onClick={() => setSelectedCategoryId(cat.category_id)}
                      className={`w-full flex items-center gap-2.5 pl-2.5 pr-2 py-2.5 text-left rounded-xl transition-colors ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      }`}
                    >
                      {/* Color dot */}
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="flex-1 text-sm font-medium truncate">
                        {cat.name}
                      </span>

                      {/* Count badge — replaced by actions on hover when manageable */}
                      <span
                        className={`text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full transition-opacity ${
                          canManage ? "group-hover/cat:opacity-0" : ""
                        } ${
                          isSelected
                            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
                            : "bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {cat.document_count}
                      </span>
                    </button>

                    {/* Edit/Delete actions — inline on the row, revealed on hover */}
                    {canManage && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/cat:opacity-100 transition-opacity bg-white dark:bg-gray-800 rounded-lg">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCategory(cat);
                            setShowCategoryModal(true);
                          }}
                          className="p-1 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="Edit category"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCategory(cat);
                          }}
                          disabled={isDeleting}
                          className="p-1 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Delete category"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Documents panel */}
      <div className="flex-1 min-w-0">
        {selectedCategory ? (
          <div
            className={`relative bg-white dark:bg-gray-800/30 dark:backdrop-blur-sm rounded-2xl border-2 transition-colors ${
              isDraggingOver
                ? "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/10"
                : "border-gray-200 dark:border-gray-700/20"
            } min-h-[300px]`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Drag overlay */}
            <AnimatePresence>
              {isDraggingOver && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl pointer-events-none"
                >
                  <CloudUpload className="w-12 h-12 text-blue-500 mb-2" />
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                    Drop files to upload to "{selectedCategory.name}"
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/20">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedCategory.color }}
                />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                  {selectedCategory.name}
                </span>
                {selectedCategory.description && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block truncate">
                    · {selectedCategory.description}
                  </span>
                )}
              </div>
              {canUpload && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors shadow-sm flex-shrink-0"
                  >
                    {uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {uploading ? "Uploading..." : "Upload Files"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </>
              )}
            </div>

            {/* Toolbar: search + sort */}
            {documents.length > 0 && (
              <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 dark:border-gray-700/20">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="relative flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <ArrowUpDown className="w-3 h-3 flex-shrink-0" />
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as "date" | "name" | "size")
                    }
                    className="bg-transparent text-xs text-gray-600 dark:text-gray-300 focus:outline-none cursor-pointer"
                  >
                    <option value="date">Newest</option>
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                  </select>
                </div>
              </div>
            )}

            {/* Documents */}
            {loadingDocs ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${selectedCategory.color}20` }}>
                  <FolderOpen
                    className="w-7 h-7"
                    style={{ color: selectedCategory.color }}
                  />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  No files yet
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {canUpload
                    ? "Upload files or drag and drop them here."
                    : "No documents have been uploaded to this category."}
                </p>
              </div>
            ) : visibleDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  No files match "{searchQuery}"
                </p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <AnimatePresence>
                  {visibleDocuments.map((doc) => {
                    const Icon = getFileIcon(doc.file_extension);
                    const isDeleting = deletingDocId === doc.document_id;
                    const uploaderName =
                      doc.first_name
                        ? `${doc.first_name} ${doc.last_name || ""}`.trim()
                        : null;

                    return (
                      <motion.div
                        key={doc.document_id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.15 }}
                        className="group bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700/30 rounded-xl p-3 hover:border-blue-300 dark:hover:border-blue-600/60 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                              backgroundColor: `${selectedCategory.color}20`,
                            }}
                          >
                            <Icon
                              className="w-4.5 h-4.5"
                              style={{ color: selectedCategory.color }}
                              size={18}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate"
                              title={doc.original_name}
                            >
                              {doc.original_name}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {formatBytes(doc.file_size)}
                              {uploaderName && ` · ${uploaderName}`}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {new Date(doc.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 mt-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {canUpload && (
                            <button
                              onClick={() => handleDeleteDocument(doc)}
                              disabled={isDeleting}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              {isDeleting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800/30 dark:backdrop-blur-sm rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700/30 min-h-[300px] flex flex-col items-center justify-center text-center px-6 py-16">
            {canManage ? (
              <>
                <FolderPlus className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Create a category to start uploading materials
                </p>
                <button
                  onClick={() => {
                    setEditingCategory(null);
                    setShowCategoryModal(true);
                  }}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Category
                </button>
              </>
            ) : (
              <>
                <FolderOpen className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No materials available yet
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <DocumentPreviewModal
        isOpen={previewDoc !== null}
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
        downloadFn={subjectDocumentsApi.download}
      />

      <CategoryFormModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
        }}
        onSaved={handleCategorySaved}
        subjectId={subjectId}
        editingCategory={editingCategory}
      />
    </div>
  );
};

export default SubjectMaterialsTab;
