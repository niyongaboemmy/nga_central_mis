// Type definitions for Documents components
export type ViewMode = "grid" | "list";
export type SortOption = "name" | "size" | "date" | "type";
export type TabType = "my-documents" | "shared-with-me";
export type ShareTabType = "people" | "roles" | "links";

export interface BreadcrumbItem {
  id: number | null;
  name: string;
  isShared?: boolean;
}

export interface DocumentPermission {
  permission_id: number;
  user_id: number;
  permission_type: "VIEW" | "EDIT" | "DOWNLOAD" | "SHARE";
  expires_at: string | null;
  created_at: string;
  shared_by: number;
  user: {
    user_id: number;
    username: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
}

export interface RolePermission {
  permission_id: number;
  role: {
    role_id: number;
    name: string;
    description: string | null;
  };
  permission_type: "VIEW" | "EDIT" | "DOWNLOAD" | "SHARE";
  users: any[];
}

export interface ContextMenuItem {
  x: number;
  y: number;
  item: any | null;
  type:
    | "folder"
    | "document"
    | "shared-document"
    | "shared-folder"
    | "background";
}

// Helper function to get item key
export const getItemKey = (item: any): string => {
  if (item.folder_id !== undefined) {
    return `folder-${item.folder_id}`;
  }
  return `doc-${item.document_id}`;
};

// Helper function to check if item is a folder
export const isFolder = (item: any): item is any => {
  return item.folder_id !== undefined && item.parent_folder_id !== undefined;
};

// Get initials from name
export const getInitials = (
  firstName?: string | null,
  lastName?: string | null,
  username?: string
): string => {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName.slice(0, 2).toUpperCase();
  }
  if (username) {
    return username.slice(0, 2).toUpperCase();
  }
  return "??";
};

// Get random color for avatar
export const getAvatarColor = (name: string): string => {
  const colors = [
    "bg-gradient-to-br from-pink-400 to-pink-600",
    "bg-gradient-to-br from-purple-400 to-purple-600",
    "bg-gradient-to-br from-indigo-400 to-indigo-600",
    "bg-gradient-to-br from-blue-400 to-blue-600",
    "bg-gradient-to-br from-cyan-400 to-cyan-600",
    "bg-gradient-to-br from-teal-400 to-teal-600",
    "bg-gradient-to-br from-green-400 to-green-600",
    "bg-gradient-to-br from-yellow-400 to-yellow-600",
    "bg-gradient-to-br from-orange-400 to-orange-600",
    "bg-gradient-to-br from-red-400 to-red-600",
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};

// Permission badge colors
export const getPermissionBadgeColor = (type: string) => {
  switch (type) {
    case "VIEW":
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    case "EDIT":
      return "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
    case "DOWNLOAD":
      return "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
    case "SHARE":
      return "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400";
    default:
      return "bg-gray-100 text-gray-600";
  }
};

// Animation variants
export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 20 },
};
