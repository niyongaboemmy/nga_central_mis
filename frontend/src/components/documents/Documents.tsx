import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "../../contexts/ToastContext";
import {
  folderApi,
  documentApi,
  userApi,
  type Folder,
  type Document,
  type SharedDocument,
  type UserSearchResult,
  type Role,
} from "../../api/documents";
import { roleApi, folderPermissionApi } from "../../api/documents";
import FolderTree from "./FolderTree";
import DocumentsToolbar from "./DocumentsToolbar";
import DocumentsContent from "./DocumentsContent";
import SharedWithMeContent from "./SharedWithMeContent";
import CreateFolderModal from "./CreateFolderModal";
import RenameModal from "./RenameModal";
import ShareModal from "./ShareModal";
import DocumentPreviewModal from "./DocumentPreviewModal";
import SharedDocumentDetailsModal from "./SharedDocumentDetailsModal";
import ContextMenu from "./ContextMenu";
import StatusBar from "./StatusBar";
import LoadingOverlay from "./LoadingOverlay";
import type {
  BreadcrumbItem,
  TabType,
  ViewMode,
  SortOption,
  ShareTabType,
  DocumentPermission,
} from "./types";

const Documents: React.FC = () => {
  const { showToast } = useToast();

  // State
  const [activeTab, setActiveTab] = useState<TabType>("my-documents");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [sharedDocuments, setSharedDocuments] = useState<SharedDocument[]>([]);
  const [filteredSharedDocuments, setFilteredSharedDocuments] = useState<
    SharedDocument[]
  >([]);
  const [sharedFolders, setSharedFolders] = useState<
    {
      folder_id: string;
      user_id: string;
      parent_folder_id: string | null;
      name: string;
      description: string | null;
      color: string;
      created_at: string;
      updated_at: string;
    }[]
  >([]);
  const [filteredSharedFolders, setFilteredSharedFolders] = useState<
    {
      folder_id: string;
      user_id: string;
      parent_folder_id: string | null;
      name: string;
      description: string | null;
      color: string;
      created_at: string;
      updated_at: string;
    }[]
  >([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [currentSharedFolder, setCurrentSharedFolder] = useState<any | null>(
    null
  );
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: null, name: "My Documents" },
  ]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isUploading, setIsUploading] = useState(false);
  const [_selectedItems, setSelectedItems] = useState<(Folder | Document)[]>(
    []
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: Folder | Document | SharedDocument | any | null;
    type:
      | "folder"
      | "document"
      | "shared-document"
      | "shared-folder"
      | "background";
  } | null>(null);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameItem, setRenameItem] = useState<Folder | Document | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [renamePlaceholder, setRenamePlaceholder] = useState("New name");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [isSharedDetailsModalOpen, setIsSharedDetailsModalOpen] =
    useState(false);
  const [sharedDetailsDocument, setSharedDetailsDocument] =
    useState<SharedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [folderTree, setFolderTree] = useState<Folder[]>([]);
  const [showFolderTree, setShowFolderTree] = useState(
    window.innerWidth >= 768
  ); // md breakpoint
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemovingAccess, setIsRemovingAccess] = useState(false);
  const [isRemovingPermission, setIsRemovingPermission] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingFolderTree, setIsLoadingFolderTree] = useState(false);
  const [deletingItem, setDeletingItem] = useState<Folder | Document | null>(
    null
  );

  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareItem, setShareItem] = useState<Folder | Document | null>(null);
  const [shareTab, setShareTab] = useState<ShareTabType>("people");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<UserSearchResult[]>([]);
  const [selectedShareUsers, setSelectedShareUsers] = useState<
    UserSearchResult[]
  >([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedShareRoles, setSelectedShareRoles] = useState<Role[]>([]);
  const [sharePermission, setSharePermission] = useState<string>("VIEW");
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [existingPermissions, setExistingPermissions] = useState<
    DocumentPermission[]
  >([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [expirationDate, setExpirationDate] = useState<string>("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [_rolePermissions, setRolePermissions] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Fetch folders and documents
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (currentSharedFolder) {
        // We're in a shared folder, fetch its contents
        const [foldersRes, documentsRes] = await Promise.all([
          folderApi.getAll(currentFolderId || undefined),
          documentApi.getAll({
            folderId: currentFolderId || undefined,
            sortBy: sortBy,
            sortOrder: sortOrder,
          }),
        ]);

        setFolders(
          foldersRes.data.data?.map((item: any) => ({
            ...item.folder,
            owner: item.owner,
          })) || []
        );
        setDocuments(
          documentsRes.data.data?.map((item: any) => ({
            ...item.document,
            owner: item.owner,
          })) || []
        );
      } else {
        // Regular owned folder navigation
        const [foldersRes, documentsRes] = await Promise.all([
          folderApi.getAll(currentFolderId || undefined),
          documentApi.getAll({
            folderId: currentFolderId || undefined,
            sortBy: sortBy,
            sortOrder: sortOrder,
          }),
        ]);

        setFolders(
          foldersRes.data.data?.map((item: any) => ({
            ...item.folder,
            owner: item.owner,
          })) || []
        );
        setDocuments(
          documentsRes.data.data?.map((item: any) => ({
            ...item.document,
            owner: item.owner,
          })) || []
        );
      }
    } catch (error: any) {
      showToast("Failed to load documents", "error");
    } finally {
      setIsLoading(false);
    }
  }, [currentFolderId, currentSharedFolder, sortBy, sortOrder, showToast]);

  // Fetch shared documents
  const fetchSharedDocuments = useCallback(async () => {
    setIsLoadingShared(true);
    try {
      const [docsResponse, foldersResponse] = await Promise.all([
        documentApi.getSharedWithMe(),
        folderPermissionApi.getSharedWithMe(),
      ]);
      setSharedDocuments(docsResponse.data.data || []);
      setSharedFolders(foldersResponse.data.data || []);
    } catch (error: any) {
      showToast("Failed to load shared items", "error");
    } finally {
      setIsLoadingShared(false);
    }
  }, [showToast]);

  // Fetch folder tree (for sidebar)
  const fetchFolderTree = async () => {
    setIsLoadingFolderTree(true);
    try {
      const response = await folderApi.getAll();
      setFolderTree(
        response.data.data?.map((item: any) => ({
          ...item.folder,
          owner: item.owner,
        })) || []
      );
    } catch (error) {
      console.error("Failed to fetch folder tree:", error);
    } finally {
      setIsLoadingFolderTree(false);
    }
  };

  // Fetch roles for sharing
  const fetchRoles = async () => {
    setIsLoadingRoles(true);
    try {
      const response = await roleApi.getAll();
      setRoles(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch roles:", error);
    } finally {
      setIsLoadingRoles(false);
    }
  };

  // Fetch existing permissions for a document or folder
  const fetchPermissions = async (item: Folder | Document) => {
    setIsLoadingPermissions(true);
    try {
      if ((item as Document).document_id !== undefined) {
        const response = await documentApi.getPermissions(
          (item as Document).document_id
        );
        const permissionsData = response.data.data;
        if (permissionsData && Array.isArray(permissionsData)) {
          setExistingPermissions(permissionsData);
        } else if (permissionsData && permissionsData.userPermissions) {
          setExistingPermissions(permissionsData.userPermissions || []);
          if (permissionsData.rolePermissions) {
            setRolePermissions(permissionsData.rolePermissions);
          }
        } else {
          setExistingPermissions([]);
        }
      } else {
        const response = await folderPermissionApi.getPermissions(
          (item as Folder).folder_id
        );
        setExistingPermissions(response.data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
      setExistingPermissions([]);
    } finally {
      setIsLoadingPermissions(false);
    }
  };

  // Fetch folder permissions
  const fetchFolderPermissions = async (folderId: number) => {
    setIsLoadingPermissions(true);
    try {
      const response = await folderPermissionApi.getPermissions(folderId);
      setExistingPermissions(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch folder permissions:", error);
      setExistingPermissions([]);
    } finally {
      setIsLoadingPermissions(false);
    }
  };

  useEffect(() => {
    if (activeTab === "my-documents") {
      fetchData();
    } else {
      fetchSharedDocuments();
    }
    fetchFolderTree();
  }, [fetchData, fetchSharedDocuments, activeTab]);

  // Filter documents and shared documents based on search query
  const filterItems = useCallback(() => {
    if (!searchQuery.trim()) {
      setFilteredDocuments(documents);
      setFilteredSharedDocuments(sharedDocuments);
      setFilteredSharedFolders(sharedFolders);
      return;
    }

    const query = searchQuery.toLowerCase().trim();

    // Filter documents
    const filteredDocs = documents.filter(
      (doc) =>
        doc.original_name.toLowerCase().includes(query) ||
        doc.file_extension.toLowerCase().includes(query) ||
        (doc.description && doc.description.toLowerCase().includes(query)) ||
        (doc.tags && doc.tags.toLowerCase().includes(query))
    );
    setFilteredDocuments(filteredDocs);

    // Filter shared documents
    const filteredShared = sharedDocuments.filter(
      (sharedDoc) =>
        sharedDoc.document.original_name.toLowerCase().includes(query) ||
        sharedDoc.document.file_extension.toLowerCase().includes(query) ||
        (sharedDoc.document.description &&
          sharedDoc.document.description.toLowerCase().includes(query)) ||
        (sharedDoc.document.tags &&
          sharedDoc.document.tags.toLowerCase().includes(query)) ||
        (
          sharedDoc.permission.shared_by_user?.first_name +
          " " +
          sharedDoc.permission.shared_by_user?.last_name
        )
          .toLowerCase()
          .includes(query) ||
        sharedDoc.permission.shared_by_user?.email.toLowerCase().includes(query)
    );
    setFilteredSharedDocuments(filteredShared);
    // Filter shared folders
    const filteredSharedF = sharedFolders.filter(
      (sharedFolder: any) =>
        sharedFolder.folder?.name.toLowerCase().includes(query) ||
        (sharedFolder.folder?.description &&
          sharedFolder.folder.description.toLowerCase().includes(query)) ||
        (
          sharedFolder.permission?.shared_by_user?.first_name +
          " " +
          sharedFolder.permission?.shared_by_user?.last_name
        )
          .toLowerCase()
          .includes(query) ||
        sharedFolder.permission?.shared_by_user?.email
          .toLowerCase()
          .includes(query)
    );
    setFilteredSharedFolders(filteredSharedF);
  }, [searchQuery, documents, sharedDocuments, sharedFolders]);

  // Update filtered results when data or search changes
  useEffect(() => {
    filterItems();
  }, [filterItems]);

  // Handle click outside context menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search users for sharing
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchedUsers([]);
      setSearchError(null);
      return;
    }

    setIsSearchingUsers(true);
    setSearchError(null);
    try {
      const response = await userApi.searchUsers(query);
      setSearchedUsers(response.data.data || []);
    } catch (error: any) {
      console.error("Failed to search users:", error);
      setSearchError(error.response?.data?.message || "Failed to search users");
      setSearchedUsers([]);
    } finally {
      setIsSearchingUsers(false);
    }
  }, []);

  // Navigate to folder
  const navigateToFolder = (folder: Folder) => {
    setBreadcrumbs((prev) => {
      // Check if the folder is already in breadcrumbs
      const existingIndex = prev.findIndex((b) => b.id === folder.folder_id);
      if (existingIndex !== -1) {
        // If found, slice up to and including that folder
        return prev.slice(0, existingIndex + 1);
      }
      // If not found, add it to the end
      return [...prev, { id: folder.folder_id, name: folder.name }];
    });
    setCurrentFolderId(folder.folder_id);
    setCurrentSharedFolder(null);
    setSelectedItems([]);
  };

  // Navigate to shared folder
  const navigateToSharedFolder = async (sharedFolder: any) => {
    // First check if folder has content
    try {
      const [foldersRes, documentsRes] = await Promise.all([
        folderApi.getAll(parseInt(sharedFolder.folder.folder_id)),
        documentApi.getAll({
          folderId: parseInt(sharedFolder.folder.folder_id),
          sortBy: sortBy,
          sortOrder: sortOrder,
        }),
      ]);

      const hasContent =
        foldersRes.data.data.length > 0 || documentsRes.data.data.length > 0;

      if (!hasContent) {
        showToast(`"${sharedFolder.folder.name}" is empty`, "info");
        return;
      }

      setBreadcrumbs((prev) => [
        ...prev,
        {
          id: parseInt(sharedFolder.folder.folder_id),
          name: sharedFolder.folder.name,
          isShared: true,
        },
      ]);
      setCurrentFolderId(parseInt(sharedFolder.folder.folder_id));
      setCurrentSharedFolder(sharedFolder);
      setFolders(
        foldersRes.data.data?.map((item: any) => ({
          ...item.folder,
          owner: item.owner,
        })) || []
      );
      setDocuments(
        documentsRes.data.data?.map((item: any) => ({
          ...item.document,
          owner: item.owner,
        })) || []
      );
      setSelectedItems([]);
    } catch (error: any) {
      showToast("Failed to load folder contents", "error");
    }
  };

  // Navigate to shared subfolder (within shared context)
  const navigateToSharedSubFolder = async (folder: Folder) => {
    // Check if folder has content
    try {
      const [foldersRes, documentsRes] = await Promise.all([
        folderApi.getAll(folder.folder_id),
        documentApi.getAll({
          folderId: folder.folder_id,
          sortBy: sortBy,
          sortOrder: sortOrder,
        }),
      ]);

      const hasContent =
        foldersRes.data.data.length > 0 || documentsRes.data.data.length > 0;

      if (!hasContent) {
        showToast(`"${folder.name}" is empty`, "info");
        return;
      }

      setBreadcrumbs((prev) => [
        ...prev,
        {
          id: folder.folder_id,
          name: folder.name,
          isShared: true,
        },
      ]);
      setCurrentFolderId(folder.folder_id);
      // Keep currentSharedFolder set for the parent
      setFolders(
        foldersRes.data.data?.map((item: any) => ({
          ...item.folder,
          owner: item.owner,
        })) || []
      );
      setDocuments(
        documentsRes.data.data?.map((item: any) => ({
          ...item.document,
          owner: item.owner,
        })) || []
      );
      setSelectedItems([]);
    } catch (error: any) {
      showToast("Failed to load folder contents", "error");
    }
  };

  // Navigate to breadcrumb
  const navigateToBreadcrumb = (index: number) => {
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    const targetBreadcrumb = newBreadcrumbs[newBreadcrumbs.length - 1];

    if (targetBreadcrumb.id === null) {
      // Root breadcrumb
      setCurrentFolderId(null);
      setCurrentSharedFolder(null);
    } else if (targetBreadcrumb.isShared) {
      // Navigating to a shared folder or subfolder
      setCurrentFolderId(targetBreadcrumb.id);
      // Find the shared folder object - it might be a subfolder
      const sharedFolder = sharedFolders.find(
        (f) => parseInt(f.folder_id) === targetBreadcrumb.id
      );
      if (sharedFolder) {
        setCurrentSharedFolder(sharedFolder);
      }
      // If not found, it's a subfolder of a shared folder, keep currentSharedFolder
    } else {
      // Regular folder
      setCurrentFolderId(targetBreadcrumb.id);
      setCurrentSharedFolder(null);
    }

    setSelectedItems([]);
  };

  // Go back to parent folder
  const goBack = () => {
    if (breadcrumbs.length > 1) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      const targetBreadcrumb = newBreadcrumbs[newBreadcrumbs.length - 1];

      if (targetBreadcrumb.id === null) {
        // Going back to root
        setCurrentFolderId(null);
        setCurrentSharedFolder(null);
      } else if (targetBreadcrumb.isShared) {
        setCurrentFolderId(targetBreadcrumb.id);
        // Keep currentSharedFolder if it's a subfolder
        const sharedFolder = sharedFolders.find(
          (f) => parseInt(f.folder_id) === targetBreadcrumb.id
        );
        if (sharedFolder) {
          setCurrentSharedFolder(sharedFolder);
        }
        // If not found, it's a subfolder, keep currentSharedFolder
      } else {
        setCurrentFolderId(targetBreadcrumb.id);
        setCurrentSharedFolder(null);
      }
      setSelectedItems([]);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const uploadProgressState: { [key: string]: number } = {};

    for (let i = 0; i < files.length; i++) {
      uploadProgressState[`file-${i}`] = 0;
    }
    setUploadProgress(uploadProgressState);

    const uploadPromises = Array.from(files).map(async (file, index) => {
      const formData = new FormData();
      formData.append("file", file);
      if (currentFolderId) {
        formData.append("folderId", currentFolderId.toString());
      }

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => ({
          ...prev,
          [`file-${index}`]: Math.min((prev[`file-${index}`] || 0) + 10, 90),
        }));
      }, 100);

      try {
        const response = await documentApi.upload(formData);
        clearInterval(progressInterval);
        setUploadProgress((prev) => ({
          ...prev,
          [`file-${index}`]: 100,
        }));
        return response;
      } catch (error: any) {
        clearInterval(progressInterval);
        throw error;
      }
    });

    try {
      await Promise.all(uploadPromises);
      showToast(`${files.length} file(s) uploaded successfully`, "success");
      fetchData();
      fetchFolderTree();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to upload files",
        "error"
      );
    } finally {
      setIsUploading(false);
      setUploadProgress({});
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      showToast("Folder name is required", "error");
      return;
    }

    setIsCreatingFolder(true);
    try {
      await folderApi.create({
        name: newFolderName,
        parentFolderId: currentFolderId || undefined,
      });
      showToast("Folder created successfully", "success");
      setIsCreateFolderModalOpen(false);
      setNewFolderName("");
      fetchData();
      fetchFolderTree();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to create folder",
        "error"
      );
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Rename item
  const handleRename = async () => {
    if (!renameItem || !newItemName.trim()) {
      showToast("Name is required", "error");
      return;
    }

    setIsRenaming(true);
    try {
      const isDocument = (renameItem as Document).document_id !== undefined;
      if (isDocument) {
        // For documents, append the original extension
        const doc = renameItem as Document;
        const lastDotIndex = doc.original_name.lastIndexOf(".");
        const extension =
          lastDotIndex > 0 ? doc.original_name.substring(lastDotIndex) : "";
        const fullName = newItemName.trim() + extension;

        await documentApi.update(doc.document_id, {
          original_name: fullName,
        });
        showToast("Document renamed successfully", "success");
      } else {
        await folderApi.update((renameItem as Folder).folder_id, {
          name: newItemName,
        });
        showToast("Folder renamed successfully", "success");
      }
      setIsRenameModalOpen(false);
      setRenameItem(null);
      setNewItemName("");
      fetchData();
      fetchFolderTree();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to rename", "error");
    } finally {
      setIsRenaming(false);
    }
  };

  // Open rename modal
  const handleOpenRenameModal = (item: Folder | Document) => {
    setRenameItem(item);
    const isDocument = (item as Document).document_id !== undefined;
    if (isDocument) {
      // For documents, show name without extension
      const doc = item as Document;
      const lastDotIndex = doc.original_name.lastIndexOf(".");
      const nameWithoutExt =
        lastDotIndex > 0
          ? doc.original_name.substring(0, lastDotIndex)
          : doc.original_name;
      setNewItemName(nameWithoutExt);
      setRenamePlaceholder("New file name (extension preserved)");
    } else {
      // For folders, show full name
      setNewItemName((item as Folder).name);
      setRenamePlaceholder("New folder name");
    }
    setIsRenameModalOpen(true);
    setContextMenu(null);
  };

  // Open preview modal
  const handleOpenPreviewModal = (document: Document) => {
    setPreviewDocument(document);
    setIsPreviewModalOpen(true);
    setContextMenu(null);
  };

  // Handle preview (for default click)
  const handlePreview = (document: Document) => {
    setPreviewDocument(document);
    setIsPreviewModalOpen(true);
  };

  // Open shared document details modal
  const handleOpenSharedDetailsModal = (sharedDoc: SharedDocument) => {
    setSharedDetailsDocument(sharedDoc);
    setIsSharedDetailsModalOpen(true);
    setContextMenu(null);
  };

  // Delete item
  const handleDelete = async (item: Folder | Document) => {
    const isDocument = (item as Document).document_id !== undefined;
    const confirmMessage = isDocument
      ? `Are you sure you want to delete "${(item as Document).original_name}"?`
      : `Are you sure you want to delete folder "${
          (item as Folder).name
        }" and all its contents?`;

    if (!window.confirm(confirmMessage)) return;

    setIsDeleting(true);
    setDeletingItem(item);
    try {
      if (isDocument) {
        await documentApi.delete((item as Document).document_id);
      } else {
        await folderApi.delete((item as Folder).folder_id);
      }
      showToast(
        `${isDocument ? "File" : "Folder"} deleted successfully`,
        "success"
      );
      setSelectedItems((prev) => prev.filter((i) => i !== item));
      fetchData();
      fetchFolderTree();
    } catch (error: any) {
      showToast("Failed to delete item", "error");
    } finally {
      setIsDeleting(false);
      setDeletingItem(null);
      setContextMenu(null);
    }
  };

  // Remove shared document access
  const handleRemoveSharedAccess = async (sharedDoc: SharedDocument) => {
    const confirmMessage = `Are you sure you want to remove access to "${sharedDoc.document.original_name}"?`;
    if (!window.confirm(confirmMessage)) return;

    setIsRemovingAccess(true);
    try {
      await documentApi.revokeAccess(sharedDoc.permission.permission_id);
      showToast("Access removed successfully", "success");
      fetchSharedDocuments();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to remove access",
        "error"
      );
    } finally {
      setIsRemovingAccess(false);
      setContextMenu(null);
    }
  };

  // Remove permission from share modal
  const handleRemovePermission = async (permissionId: number) => {
    setIsRemovingPermission(true);
    try {
      if (shareItem && (shareItem as Document).document_id !== undefined) {
        await documentApi.revokeAccess(permissionId);
      } else if (shareItem) {
        await folderPermissionApi.revokeAccess(permissionId);
      }
      showToast("Access removed successfully", "success");
      if (shareItem) {
        fetchPermissions(shareItem);
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to remove access",
        "error"
      );
    } finally {
      setIsRemovingPermission(false);
    }
  };

  // Download document
  const handleDownload = async (doc: Document) => {
    setIsDownloading(true);
    try {
      const response = await documentApi.download(doc.document_id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", doc.original_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("Download started", "success");
    } catch (error) {
      showToast("Failed to download file", "error");
    } finally {
      setIsDownloading(false);
      setContextMenu(null);
    }
  };

  // Open share modal
  const handleOpenShareModal = (item: Folder | Document) => {
    setShareItem(item);
    setIsShareModalOpen(true);
    setShareTab("people");
    setUserSearchQuery("");
    setSearchedUsers([]);
    setSearchError(null);
    setSelectedShareUsers([]);
    setSelectedShareRoles([]);
    setExpirationDate("");
    fetchRoles();
    fetchPermissions(item);
    setContextMenu(null);
  };

  // Add user to share list
  const addUserToShare = (user: UserSearchResult) => {
    if (!selectedShareUsers.find((u) => u.user_id === user.user_id)) {
      setSelectedShareUsers([...selectedShareUsers, user]);
    }
    setUserSearchQuery("");
    setSearchedUsers([]);
  };

  // Remove user from share list
  const removeUserFromShare = (userId: number) => {
    setSelectedShareUsers(
      selectedShareUsers.filter((u) => u.user_id !== userId)
    );
  };

  // Toggle role selection
  const toggleRoleSelection = (role: Role) => {
    if (selectedShareRoles.find((r) => r.role_id === role.role_id)) {
      setSelectedShareRoles(
        selectedShareRoles.filter((r) => r.role_id !== role.role_id)
      );
    } else {
      setSelectedShareRoles([...selectedShareRoles, role]);
    }
  };

  // Remove role from share list
  const removeRoleFromShare = (roleId: number) => {
    setSelectedShareRoles(
      selectedShareRoles.filter((r) => r.role_id !== roleId)
    );
  };

  // Copy share link
  const copyShareLink = () => {
    if (shareItem && (shareItem as Document).document_id !== undefined) {
      const docId = (shareItem as Document).document_id;
      const link = `${window.location.origin}/documents/shared/${docId}`;
      navigator.clipboard.writeText(link).then(() => {
        setCopySuccess(true);
        showToast("Link copied to clipboard!", "success");
        setTimeout(() => setCopySuccess(false), 2000);
      });
    }
  };

  // Share document/folder with selected users and/or roles
  const handleShare = async () => {
    if (!shareItem) {
      showToast("No item selected for sharing", "error");
      return;
    }

    if (selectedShareUsers.length === 0 && selectedShareRoles.length === 0) {
      showToast(
        "Please select at least one user or role to share with",
        "error"
      );
      return;
    }

    const isDocument = (shareItem as Document).document_id !== undefined;
    const itemId = isDocument
      ? (shareItem as Document).document_id
      : (shareItem as Folder).folder_id;

    setIsSharing(true);
    try {
      if (isDocument) {
        await documentApi.share(itemId, {
          userIds: selectedShareUsers.map((u) => u.user_id),
          roleIds: selectedShareRoles.map((r) => r.role_id.toString()),
          permissionType: sharePermission,
          expiresAt: expirationDate || undefined,
        });
        showToast("Document shared successfully", "success");
        fetchPermissions(shareItem);
      } else {
        await folderPermissionApi.share(itemId, {
          userIds: selectedShareUsers.map((u) => u.user_id),
          roleIds: selectedShareRoles.map((r) => r.role_id.toString()),
          permissionType: sharePermission,
          expiresAt: expirationDate || undefined,
        });
        showToast("Folder shared successfully", "success");
        fetchFolderPermissions(itemId);
      }
      setSelectedShareUsers([]);
      setSelectedShareRoles([]);
      setUserSearchQuery("");
    } catch (error: any) {
      showToast(error.response?.data?.message || "Failed to share", "error");
    } finally {
      setIsSharing(false);
    }
  };

  // Handle context menu
  const handleContextMenu = (
    e: React.MouseEvent,
    item: any,
    type:
      | "folder"
      | "document"
      | "shared-document"
      | "shared-folder"
      | "background"
  ) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
      type,
    });
  };

  // Upload progress overlay
  const renderUploadProgress = () => (
    <AnimatePresence>
      {isUploading && Object.keys(uploadProgress).length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">
              Uploading Files...
            </h3>
            <div className="space-y-2">
              {Object.entries(uploadProgress).map(([key, progress]) => (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                    />
                  </div>
                  <span className="text-sm text-gray-500 w-12">
                    {progress}%
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Get loading message based on current operation
  const getLoadingMessage = () => {
    if (isDeleting && deletingItem) {
      const isDocument = (deletingItem as Document).document_id !== undefined;
      return isDocument
        ? `Deleting "${(deletingItem as Document).original_name}"...`
        : `Deleting folder "${(deletingItem as Folder).name}"...`;
    }
    if (isDownloading) return "Preparing download...";
    if (isRemovingAccess) return "Removing access...";
    return "Processing...";
  };

  return (
    <div className="flex bg-gray-50 dark:bg-black h-full">
      {/* Folder Tree Sidebar */}
      <AnimatePresence>
        {showFolderTree && activeTab === "my-documents" && (
          <FolderTree
            showFolderTree={showFolderTree}
            currentFolderId={currentFolderId}
            folderTree={folderTree}
            isLoading={isLoadingFolderTree}
            onNavigateToFolder={navigateToFolder}
            onGoToRoot={() => {
              setBreadcrumbs([{ id: null, name: "My Documents" }]);
              setCurrentFolderId(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <DocumentsToolbar
          activeTab={activeTab}
          breadcrumbs={breadcrumbs}
          viewMode={viewMode}
          searchQuery={searchQuery}
          sortBy={sortBy}
          sortOrder={sortOrder}
          sharedDocumentsCount={sharedDocuments.length}
          sharedFoldersCount={sharedFolders.length}
          showFolderTree={showFolderTree}
          isUploading={isUploading}
          currentFolderId={currentFolderId}
          currentSharedFolder={currentSharedFolder}
          onTabChange={(tab) => {
            setActiveTab(tab);
            if (tab === "my-documents") {
              setSearchQuery("");
              setCurrentFolderId(null);
              setCurrentSharedFolder(null);
              setBreadcrumbs([{ id: null, name: "My Documents" }]);
            } else if (tab === "shared-with-me") {
              setSearchQuery("");
              setCurrentFolderId(null);
              setCurrentSharedFolder(null);
              setBreadcrumbs([{ id: null, name: "Shared with Me" }]);
            }
          }}
          onBreadcrumbClick={navigateToBreadcrumb}
          onGoToRoot={() => {
            if (activeTab === "my-documents") {
              setBreadcrumbs([{ id: null, name: "My Documents" }]);
              setCurrentFolderId(null);
              setCurrentSharedFolder(null);
            } else {
              setBreadcrumbs([{ id: null, name: "Shared with Me" }]);
              setCurrentFolderId(null);
              setCurrentSharedFolder(null);
            }
          }}
          onViewModeChange={setViewMode}
          onSearchChange={setSearchQuery}
          onSortChange={setSortBy}
          onSortOrderChange={() =>
            setSortOrder(sortOrder === "asc" ? "desc" : "asc")
          }
          onToggleFolderTree={() => setShowFolderTree(!showFolderTree)}
          onGoBack={goBack}
          onCreateFolder={() => setIsCreateFolderModalOpen(true)}
          onUploadClick={() => fileInputRef.current?.click()}
        />

        {/* Content Area */}
        <div
          className="flex- overflow-auto p-4 w-full"
          style={{
            height:
              activeTab === "shared-with-me"
                ? "calc(100vh - 215px)"
                : "calc(100vh - 270px)",
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              item: null,
              type: "background",
            });
          }}
        >
          {activeTab === "shared-with-me" ? (
            <SharedWithMeContent
              isLoadingShared={isLoadingShared}
              viewMode={viewMode}
              filteredSharedDocuments={filteredSharedDocuments}
              filteredSharedFolders={filteredSharedFolders}
              sortBy={sortBy}
              sortOrder={sortOrder}
              currentSharedFolder={currentSharedFolder}
              folders={folders}
              filteredDocuments={filteredDocuments}
              onNavigateToSharedFolder={navigateToSharedFolder}
              onNavigateToSharedSubFolder={navigateToSharedSubFolder}
              onPreview={handlePreview}
              onContextMenu={handleContextMenu}
            />
          ) : (
            <DocumentsContent
              isLoading={isLoading}
              isLoadingShared={isLoadingShared}
              activeTab={activeTab}
              viewMode={viewMode}
              folders={folders}
              filteredDocuments={filteredDocuments}
              filteredSharedDocuments={filteredSharedDocuments}
              filteredSharedFolders={filteredSharedFolders}
              sortBy={sortBy}
              sortOrder={sortOrder}
              currentSharedFolder={currentSharedFolder}
              onNavigateToFolder={navigateToFolder}
              onNavigateToSharedFolder={navigateToSharedFolder}
              onNavigateToSharedSubFolder={navigateToSharedSubFolder}
              onContextMenu={handleContextMenu}
              onPreview={handlePreview}
            />
          )}
        </div>

        {/* Status Bar */}
        <StatusBar
          activeTab={activeTab}
          foldersCount={folders.length}
          documentsCount={documents.length}
          sharedDocumentsCount={sharedDocuments.length}
          sharedFoldersCount={sharedFolders.length}
          viewMode={viewMode}
        />
      </div>

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        folderName={newFolderName}
        isCreating={isCreatingFolder}
        onFolderNameChange={setNewFolderName}
        onCreate={handleCreateFolder}
        onClose={() => {
          setIsCreateFolderModalOpen(false);
          setNewFolderName("");
        }}
      />

      {/* Rename Modal */}
      <RenameModal
        isOpen={isRenameModalOpen}
        itemName={newItemName}
        isRenaming={isRenaming}
        placeholder={renamePlaceholder}
        onItemNameChange={setNewItemName}
        onRename={handleRename}
        onClose={() => {
          setIsRenameModalOpen(false);
          setRenameItem(null);
          setNewItemName("");
          setRenamePlaceholder("New name");
        }}
      />

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        isOpen={isPreviewModalOpen}
        document={previewDocument}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setPreviewDocument(null);
        }}
      />

      {/* Shared Document Details Modal */}
      <SharedDocumentDetailsModal
        isOpen={isSharedDetailsModalOpen}
        sharedDocument={sharedDetailsDocument}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onClose={() => {
          setIsSharedDetailsModalOpen(false);
          setSharedDetailsDocument(null);
        }}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        shareItem={shareItem}
        shareTab={shareTab}
        userSearchQuery={userSearchQuery}
        searchedUsers={searchedUsers}
        selectedShareUsers={selectedShareUsers}
        roles={roles}
        selectedShareRoles={selectedShareRoles}
        sharePermission={sharePermission}
        isSearchingUsers={isSearchingUsers}
        isSharing={isSharing}
        isLoadingRoles={isLoadingRoles}
        existingPermissions={existingPermissions}
        isLoadingPermissions={isLoadingPermissions}
        isRemovingPermission={isRemovingPermission}
        expirationDate={expirationDate}
        copySuccess={copySuccess}
        searchError={searchError}
        onShareTabChange={setShareTab}
        onUserSearchQueryChange={setUserSearchQuery}
        onSearchUsers={() => searchUsers(userSearchQuery)}
        onAddUser={addUserToShare}
        onRemoveUser={removeUserFromShare}
        onToggleRole={toggleRoleSelection}
        onRemoveRole={removeRoleFromShare}
        onPermissionChange={setSharePermission}
        onExpirationDateChange={setExpirationDate}
        onCopyLink={copyShareLink}
        onShare={handleShare}
        onRemovePermission={handleRemovePermission}
        onClose={() => {
          setIsShareModalOpen(false);
          setShareItem(null);
          setSelectedShareUsers([]);
          setSelectedShareRoles([]);
          setUserSearchQuery("");
          setSearchError(null);
        }}
      />

      {/* Context Menu */}
      <div ref={contextMenuRef}>
        <ContextMenu
          contextMenu={contextMenu}
          activeTab={activeTab}
          isInSharedFolder={!!currentSharedFolder}
          onNavigateToFolder={navigateToFolder}
          onDownload={handleDownload}
          onOpenShareModal={handleOpenShareModal}
          onOpenRenameModal={handleOpenRenameModal}
          onOpenPreviewModal={handleOpenPreviewModal}
          onOpenSharedDetailsModal={handleOpenSharedDetailsModal}
          onDelete={handleDelete}
          onRemoveSharedAccess={handleRemoveSharedAccess}
          onCreateFolder={() => setIsCreateFolderModalOpen(true)}
          onUploadFiles={() => fileInputRef.current?.click()}
          onClose={() => setContextMenu(null)}
        />
      </div>

      {/* Upload Progress */}
      {renderUploadProgress()}

      {/* Global Loading Overlay */}
      <LoadingOverlay
        isVisible={isDeleting || isDownloading || isRemovingAccess}
        message={getLoadingMessage()}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept="*/*"
      />
    </div>
  );
};

export default Documents;
