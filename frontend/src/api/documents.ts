import { apiService } from "../services/api";

// Types
export interface Folder {
  folder_id: number;
  user_id: number;
  parent_folder_id: number | null;
  academic_year_id: number | null;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  owner?: {
    user_id: number;
    username: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  /** How many people this folder is shared with (owner's own listing only). */
  share_count?: number;
}

export interface Document {
  document_id: number;
  user_id: number;
  folder_id: number | null;
  academic_year_id: number | null;
  file_name: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  file_extension: string;
  is_public: number;
  description: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  owner?: {
    user_id: number;
    username: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  /** How many people this document is shared with (owner's own listing only). */
  share_count?: number;
}

export interface DocumentVersion {
  version_id: number;
  document_id: number;
  user_id: number;
  version_number: number;
  file_name: string;
  file_path: string;
  file_size: number;
  change_description: string | null;
  created_at: string;
}

export interface SharedDocument {
  document: Document;
  permission: {
    permission_id: number;
    document_id: number;
    user_id: number;
    permission_type: "VIEW" | "EDIT" | "DOWNLOAD" | "SHARE";
    shared_by: number;
    expires_at: string | null;
    created_at: string;
    shared_by_user?: {
      user_id: number;
      username: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
    };
  };
}

export interface UserSearchResult {
  user_id: number;
  username: string;
  email: string;
  phone_number: string | null;
  status: string;
  first_name: string | null;
  last_name: string | null;
}

export interface Role {
  role_id: number;
  name: string;
  description: string | null;
  status: string;
}

// Filter option interfaces
export interface Subject {
  subject_id: number;
  name: string;
  code: string | null;
  // Extended fields for myAssignments
  subject_name?: string;
  subject_code?: string;
}

export interface Program {
  program_id: number;
  name: string;
  // Extended fields for myAssignments
  program_name?: string;
}

export interface Grade {
  grade_id: number;
  name: string;
  level_order: number;
  // Extended fields for myAssignments
  grade_name?: string;
}

export interface AcademicTerm {
  academic_term_id: number;
  name: string;
  is_current: number;
}

export interface FilterOptions {
  myAssignments: {
    assignedSubjects: Subject[];
    enrolledSubjects: Subject[];
    programLeads: Program[];
    gradeAssignments: Grade[];
  };
  options: {
    subjects: Subject[];
    programs: Program[];
    grades: Grade[];
    academicTerms: AcademicTerm[];
  };
  currentTermId: number | null;
}

// API functions for folders
export const folderApi = {
  create: (data: {
    name: string;
    description?: string;
    parentFolderId?: number;
    color?: string;
    academicYearId?: number;
  }) => apiService.post("/documents/folders", data),

  getAll: (parentFolderId?: number, academicYearId?: number) => {
    const params: any = {};
    if (
      parentFolderId &&
      typeof parentFolderId === "number" &&
      parentFolderId > 0
    ) {
      params.parentFolderId = parentFolderId;
    }
    if (
      academicYearId &&
      typeof academicYearId === "number" &&
      academicYearId > 0
    ) {
      params.academicYearId = academicYearId;
    }
    return apiService.get("/documents/folders", { params });
  },

  getTree: (academicYearId?: number) =>
    apiService.get("/documents/folders/tree", {
      params: academicYearId ? { academicYearId } : undefined,
    }),

  getById: (folderId: number) => {
    if (typeof folderId !== "number" || isNaN(folderId) || folderId <= 0) {
      throw new Error("Invalid folder ID");
    }
    return apiService.get(`/documents/folders/${folderId}`);
  },

  update: (
    folderId: number,
    data: { name?: string; description?: string; color?: string },
  ) => apiService.put(`/documents/folders/${folderId}`, data),

  delete: (folderId: number) =>
    apiService.delete(`/documents/folders/${folderId}`),
};

// API functions for documents
export const documentApi = {
  upload: (data: FormData) =>
    apiService.post("/documents/upload", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  getAll: (params?: {
    folderId?: number;
    academicYearId?: number;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) => apiService.get("/documents", { params }),

  getByFolder: (folderId: number, params?: { page?: number; limit?: number }) =>
    apiService.get(`/documents/folder/${folderId}`, { params }),

  getById: (documentId: number) => apiService.get(`/documents/${documentId}`),

  update: (
    documentId: number,
    data: {
      description?: string;
      tags?: string;
      is_public?: boolean;
      original_name?: string;
    },
  ) => apiService.put(`/documents/${documentId}`, data),

  delete: (documentId: number) => apiService.delete(`/documents/${documentId}`),

  download: (documentId: number) =>
    apiService.get(`/documents/${documentId}/download`, {
      responseType: "blob",
      timeout: 60000,
    }),

  uploadVersion: (documentId: number, data: FormData) =>
    apiService.post(`/documents/${documentId}/versions`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  getVersions: (documentId: number) =>
    apiService.get(`/documents/${documentId}/versions`),

  getPermissions: (documentId: number) =>
    apiService.get(`/documents/${documentId}/permissions`),

  share: (
    documentId: number,
    data: {
      userIds?: number[];
      roleIds?: string[];
      permissionType?: string;
      expiresAt?: string;
      filterType?: string;
      filterIds?: number[];
      academicTermId?: number;
    },
  ) => apiService.post(`/documents/${documentId}/share`, data),

  getShareFilterOptions: () =>
    apiService.get("/documents/share/filter-options"),

  getSharedWithMe: (academicYearId?: number) =>
    apiService.get("/documents/shared/with-me", {
      params: academicYearId ? { academicYearId } : undefined,
    }),

  revokeAccess: (permissionId: number) =>
    apiService.delete(`/documents/permissions/${permissionId}`),

  updatePermission: (
    permissionId: number,
    data: { permissionType?: string; expiresAt?: string | null },
  ) => apiService.put(`/documents/permissions/${permissionId}`, data),

  getShareLink: (documentId: number) =>
    apiService.get<{ data: ShareLink | null }>(
      `/documents/${documentId}/share-link`,
    ),

  createShareLink: (
    documentId: number,
    data: { permissionType?: "VIEW" | "DOWNLOAD"; expiresAt?: string },
  ) =>
    apiService.post<{ data: ShareLink }>(
      `/documents/${documentId}/share-link`,
      data,
    ),

  revokeShareLink: (documentId: number) =>
    apiService.delete(`/documents/${documentId}/share-link`),
};

export interface ShareLink {
  link_id: number;
  document_id: number | null;
  folder_id: number | null;
  token: string;
  permission_type: "VIEW" | "DOWNLOAD";
  created_by: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

// Utility functions
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const getFileIcon = (
  mimeType: string,
  fileExtension: string,
): string => {
  const ext = fileExtension.toLowerCase();

  // Images
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  // PDF
  if (ext === "pdf") {
    return "pdf";
  }

  // Word documents
  if (["doc", "docx"].includes(ext)) {
    return "word";
  }

  // Excel spreadsheets
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return "excel";
  }

  // PowerPoint
  if (["ppt", "pptx"].includes(ext)) {
    return "powerpoint";
  }

  // Videos
  if (mimeType.startsWith("video/")) {
    return "video";
  }

  // Audio
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  // Archives
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return "archive";
  }

  // Code files
  if (
    ["js", "ts", "html", "css", "json", "py", "java", "c", "cpp"].includes(ext)
  ) {
    return "code";
  }

  // Default file
  return "file";
};

export const getFileTypeColor = (
  mimeType: string,
  fileExtension: string,
): string => {
  const ext = fileExtension.toLowerCase();

  if (mimeType.startsWith("image/")) return "text-blue-500";
  if (ext === "pdf") return "text-red-500";
  if (["doc", "docx"].includes(ext)) return "text-blue-600";
  if (["xls", "xlsx", "csv"].includes(ext)) return "text-green-600";
  if (["ppt", "pptx"].includes(ext)) return "text-orange-500";
  if (mimeType.startsWith("video/")) return "text-red-500";
  if (mimeType.startsWith("audio/")) return "text-yellow-500";
  if (["zip", "rar", "7z"].includes(ext)) return "text-gray-500";

  return "text-gray-400";
};

// User API for searching users (for document sharing)
export const userApi = {
  searchUsers: (query: string) =>
    apiService.get("/users/search", { params: { q: query } }),
};

// Role API functions
export const roleApi = {
  getAll: () => apiService.get("/documents/roles"),

  getById: (roleId: number) => apiService.get(`/documents/roles/${roleId}`),

  getUsersByRole: (
    roleId: number,
    params?: {
      page?: number;
      limit?: number;
      gradeId?: number;
      classGroupId?: number;
    },
  ) => apiService.get(`/documents/roles/${roleId}/users`, { params }),
};

// Folder permissions API
export const folderPermissionApi = {
  getPermissions: (folderId: number) =>
    apiService.get(`/documents/folders/${folderId}/permissions`),

  share: (
    folderId: number,
    data: {
      userIds?: number[];
      roleIds?: string[];
      permissionType?: string;
      expiresAt?: string;
      filterType?: string;
      filterIds?: number[];
      academicTermId?: number;
    },
  ) => apiService.post(`/documents/folders/${folderId}/share`, data),

  revokeAccess: (permissionId: number) =>
    apiService.delete(`/documents/folders/permissions/${permissionId}`),

  updatePermission: (
    permissionId: number,
    data: { permissionType?: string; expiresAt?: string | null },
  ) => apiService.put(`/documents/folders/permissions/${permissionId}`, data),

  getSharedWithMe: (academicYearId?: number) =>
    apiService.get<{
      data: {
        folder_id: string;
        user_id: string;
        parent_folder_id: string | null;
        name: string;
        description: string | null;
        color: string;
        created_at: string;
        updated_at: string;
      }[];
    }>("/documents/shared/folders", {
      params: academicYearId ? { academicYearId } : undefined,
    }),

  getShareLink: (folderId: number) =>
    apiService.get<{ data: ShareLink | null }>(
      `/documents/folders/${folderId}/share-link`,
    ),

  createShareLink: (
    folderId: number,
    data: { permissionType?: "VIEW" | "DOWNLOAD"; expiresAt?: string },
  ) =>
    apiService.post<{ data: ShareLink }>(
      `/documents/folders/${folderId}/share-link`,
      data,
    ),

  revokeShareLink: (folderId: number) =>
    apiService.delete(`/documents/folders/${folderId}/share-link`),
};
