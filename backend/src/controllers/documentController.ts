import { db } from "../db";
import {
  DocumentFolder,
  Document,
  DocumentVersion,
  DocumentPermission,
  FolderPermission,
  User,
  UserProfile,
  Role,
  UserRole,
} from "../db/schema";
import {
  eq,
  and,
  desc,
  asc,
  isNull,
  gt,
  or,
  SQL,
  inArray,
  sql,
} from "drizzle-orm";
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
} from "../errors/CustomError";
import { successResponse, paginatedResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import { sanitizeString } from "../utils/sanitization";
import logger from "../utils/logger";
import ftpService from "../utils/ftp";
import fs from "fs";
import path from "path";

// ======================
// ROLE OPERATIONS
// ======================

export const getAllRoles = asyncHandler(async (req: any, res: any) => {
  const roles = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(Role)
    .where(eq(Role.status, "ACTIVE"))
    .orderBy(asc(Role.name));

  successResponse(res, "Roles retrieved successfully", roles);
});

export const getRoleById = asyncHandler(async (req: any, res: any) => {
  const { roleId } = req.params;

  const role = await db
    .select({
      role_id: Role.role_id,
      name: Role.name,
      description: Role.description,
      status: Role.status,
    })
    .from(Role)
    .where(eq(Role.role_id, parseInt(roleId)))
    .limit(1);

  if (role.length === 0) {
    throw new NotFoundError("Role not found");
  }

  successResponse(res, "Role retrieved successfully", role[0]);
});

// Get users in a specific role
export const getUsersByRole = asyncHandler(async (req: any, res: any) => {
  const { roleId } = req.params;

  const users = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      status: User.status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(UserRole)
    .innerJoin(User, eq(UserRole.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(eq(UserRole.role_id, parseInt(roleId)));

  successResponse(res, "Users retrieved successfully", users);
});

// ======================
// FOLDER OPERATIONS
// ======================

export const createFolder = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { name, description, parentFolderId, color } = req.body;

  // Validate input
  if (!name || name.trim().length === 0) {
    throw new ValidationError("Folder name is required");
  }

  if (name.length > 255) {
    throw new ValidationError("Folder name must be less than 255 characters");
  }

  // Check if parent folder exists and belongs to user
  if (parentFolderId) {
    const parentFolder = await db
      .select()
      .from(DocumentFolder)
      .where(
        and(
          eq(DocumentFolder.folder_id, parentFolderId),
          eq(DocumentFolder.user_id, userId)
        )
      )
      .limit(1);

    if (parentFolder.length === 0) {
      throw new ValidationError("Parent folder not found");
    }
  }

  const result = await db.insert(DocumentFolder).values({
    user_id: userId,
    parent_folder_id: parentFolderId || null,
    name: sanitizeString(name),
    description: description ? sanitizeString(description) : null,
    color: color || "#008d3b",
  });

  const folderId = result[0].insertId;

  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, folderId))
    .limit(1);

  logger.info(`Folder created: ${folderId} by user ${userId}`);

  successResponse(res, "Folder created successfully", folder[0]);
});

export const getFolders = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { parentFolderId } = req.query;

  const parentId = parentFolderId ? parseInt(parentFolderId) : null;

  // Get folders owned by the user
  const ownedFolders = await db
    .select({
      folder: DocumentFolder,
      owner: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(DocumentFolder)
    .innerJoin(User, eq(DocumentFolder.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(
      and(
        eq(DocumentFolder.user_id, userId),
        parentId === null
          ? isNull(DocumentFolder.parent_folder_id)
          : eq(DocumentFolder.parent_folder_id, parentId)
      )
    );

  // Get folders shared with the user
  let sharedFolders: any[] = [];
  if (parentId === null) {
    // Root level shared folders
    sharedFolders = await db
      .select({
        folder: DocumentFolder,
        permission: FolderPermission,
        owner: {
          user_id: User.user_id,
          username: User.username,
          email: User.email,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        },
      })
      .from(FolderPermission)
      .innerJoin(
        DocumentFolder,
        eq(FolderPermission.folder_id, DocumentFolder.folder_id)
      )
      .innerJoin(User, eq(DocumentFolder.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(
          eq(FolderPermission.user_id, userId),
          isNull(DocumentFolder.parent_folder_id),
          or(
            isNull(FolderPermission.expires_at),
            gt(FolderPermission.expires_at, new Date())
          )
        )
      );
  } else {
    // Check if the parent folder is shared with the user
    const parentSharedCheck = await db
      .select()
      .from(FolderPermission)
      .where(
        and(
          eq(FolderPermission.folder_id, parentId),
          eq(FolderPermission.user_id, userId),
          or(
            isNull(FolderPermission.expires_at),
            gt(FolderPermission.expires_at, new Date())
          )
        )
      )
      .limit(1);

    if (parentSharedCheck.length > 0) {
      // Parent is shared, get all subfolders (owned by the original owner)
      const parentFolder = await db
        .select()
        .from(DocumentFolder)
        .where(eq(DocumentFolder.folder_id, parentId))
        .limit(1);

      if (parentFolder.length > 0) {
        const subFolders = await db
          .select({
            folder: DocumentFolder,
            owner: {
              user_id: User.user_id,
              username: User.username,
              email: User.email,
              first_name: UserProfile.first_name,
              last_name: UserProfile.last_name,
            },
          })
          .from(DocumentFolder)
          .innerJoin(User, eq(DocumentFolder.user_id, User.user_id))
          .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
          .where(
            and(
              eq(DocumentFolder.parent_folder_id, parentId),
              eq(DocumentFolder.user_id, parentFolder[0].user_id)
            )
          );

        // Mark these as accessible due to parent permission
        sharedFolders = subFolders.map((item) => ({
          ...item,
          permission: parentSharedCheck[0], // Use parent permission
        }));
      }
    }
  }

  // Combine owned and shared folders, removing duplicates
  const allFolders = [...ownedFolders];
  const ownedFolderIds = new Set(ownedFolders.map((f) => f.folder.folder_id));

  for (const shared of sharedFolders) {
    if (!ownedFolderIds.has(shared.folder.folder_id)) {
      allFolders.push({
        folder: {
          ...shared.folder,
          is_shared: true,
          permission_type: shared.permission.permission_type,
        },
        owner: shared.owner,
      });
    }
  }

  // Sort by name
  allFolders.sort((a, b) => a.folder.name.localeCompare(b.folder.name));

  successResponse(res, "Folders retrieved successfully", allFolders);
});

export const getFolderById = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;

  // First try to get owned folder
  let folder = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, parseInt(folderId)),
        eq(DocumentFolder.user_id, userId)
      )
    )
    .limit(1);

  // If not found, check if it's a shared folder
  if (folder.length === 0) {
    const sharedFolder = await db
      .select({
        folder: DocumentFolder,
        permission: FolderPermission,
      })
      .from(FolderPermission)
      .innerJoin(
        DocumentFolder,
        eq(FolderPermission.folder_id, DocumentFolder.folder_id)
      )
      .where(
        and(
          eq(FolderPermission.folder_id, parseInt(folderId)),
          eq(FolderPermission.user_id, userId),
          or(
            isNull(FolderPermission.expires_at),
            gt(FolderPermission.expires_at, new Date())
          )
        )
      )
      .limit(1);

    if (sharedFolder.length > 0) {
      folder = [
        {
          ...sharedFolder[0].folder,
          is_shared: true,
          permission_type: sharedFolder[0].permission.permission_type,
        } as any,
      ];
    }
  }

  if (folder.length === 0) {
    throw new NotFoundError("Folder not found");
  }

  successResponse(res, "Folder retrieved successfully", folder[0]);
});

export const updateFolder = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;
  const { name, description, color } = req.body;

  // Check if folder exists and belongs to user
  const existingFolder = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, parseInt(folderId)),
        eq(DocumentFolder.user_id, userId)
      )
    )
    .limit(1);

  if (existingFolder.length === 0) {
    throw new NotFoundError("Folder not found");
  }

  const updateData: any = {};
  if (name) {
    if (name.trim().length === 0) {
      throw new ValidationError("Folder name cannot be empty");
    }
    updateData.name = sanitizeString(name);
  }
  if (description !== undefined) {
    updateData.description = sanitizeString(description);
  }
  if (color) {
    updateData.color = color;
  }

  await db
    .update(DocumentFolder)
    .set(updateData)
    .where(eq(DocumentFolder.folder_id, parseInt(folderId)));

  const updated = await db
    .select()
    .from(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, parseInt(folderId)))
    .limit(1);

  logger.info(`Folder updated: ${folderId} by user ${userId}`);

  successResponse(res, "Folder updated successfully", updated[0]);
});

export const deleteFolder = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;

  // Check if folder exists and belongs to user
  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, parseInt(folderId)),
        eq(DocumentFolder.user_id, userId)
      )
    )
    .limit(1);

  if (folder.length === 0) {
    throw new NotFoundError("Folder not found");
  }

  // Delete all documents in the folder
  const documents = await db
    .select()
    .from(Document)
    .where(eq(Document.folder_id, parseInt(folderId)));

  // Delete physical files from FTP
  for (const doc of documents) {
    try {
      await ftpService.deleteFile(doc.file_path);
    } catch (error) {
      logger.warn(`Failed to delete file from FTP: ${doc.file_path}`);
    }
  }

  // Delete documents and their versions
  await db.delete(Document).where(eq(Document.folder_id, parseInt(folderId)));
  await db
    .delete(DocumentFolder)
    .where(eq(DocumentFolder.folder_id, parseInt(folderId)));

  logger.info(`Folder deleted: ${folderId} by user ${userId}`);

  successResponse(res, "Folder deleted successfully", null);
});

// ======================
// FOLDER SHARING OPERATIONS
// ======================

// Get folder permissions
export const getFolderPermissions = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;

  // Check if folder exists and belongs to user
  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, parseInt(folderId)),
        eq(DocumentFolder.user_id, userId)
      )
    )
    .limit(1);

  if (folder.length === 0) {
    throw new NotFoundError("Folder not found");
  }

  // Get user permissions with user details
  const userPermissions = await db
    .select({
      permission_id: FolderPermission.permission_id,
      user_id: FolderPermission.user_id,
      permission_type: FolderPermission.permission_type,
      expires_at: FolderPermission.expires_at,
      created_at: FolderPermission.created_at,
      shared_by: FolderPermission.shared_by,
      user: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(FolderPermission)
    .innerJoin(User, eq(FolderPermission.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(eq(FolderPermission.folder_id, parseInt(folderId)));

  successResponse(
    res,
    "Folder permissions retrieved successfully",
    userPermissions
  );
});

// Share folder with users or roles
export const shareFolder = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId } = req.params;
  const { userIds, roleIds, permissionType, expiresAt } = req.body;

  if (
    (!userIds || !Array.isArray(userIds) || userIds.length === 0) &&
    (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0)
  ) {
    throw new ValidationError("At least one user ID or role ID is required");
  }

  // Check if folder exists and belongs to user
  const folder = await db
    .select()
    .from(DocumentFolder)
    .where(
      and(
        eq(DocumentFolder.folder_id, parseInt(folderId)),
        eq(DocumentFolder.user_id, userId)
      )
    )
    .limit(1);

  if (folder.length === 0) {
    throw new NotFoundError("Folder not found");
  }

  const permissions = [];

  // Share with users
  if (userIds && userIds.length > 0) {
    for (const targetUserId of userIds) {
      // Check if permission already exists
      const existingPerm = await db
        .select()
        .from(FolderPermission)
        .where(
          and(
            eq(FolderPermission.folder_id, parseInt(folderId)),
            eq(FolderPermission.user_id, targetUserId)
          )
        )
        .limit(1);

      if (existingPerm.length === 0) {
        const result = await db.insert(FolderPermission).values({
          folder_id: parseInt(folderId),
          user_id: targetUserId,
          permission_type: permissionType || "VIEW",
          shared_by: userId,
          expires_at: expiresAt ? new Date(expiresAt) : null,
        });

        const permId = result[0].insertId;
        const perm = await db
          .select()
          .from(FolderPermission)
          .where(eq(FolderPermission.permission_id, permId))
          .limit(1);

        permissions.push({
          ...perm[0],
          shared_with: "user",
          target_id: targetUserId,
        });
      }
    }
  }

  // Share with roles
  if (roleIds && roleIds.length > 0) {
    // Get all users in these roles
    const usersInRoles = await db
      .select({
        user_id: UserRole.user_id,
        role_id: UserRole.role_id,
      })
      .from(UserRole)
      .where(
        inArray(
          UserRole.role_id,
          roleIds.map((id: string) => parseInt(id))
        )
      );

    // Get unique user IDs
    const uniqueUserIds = [...new Set(usersInRoles.map((ur) => ur.user_id))];

    for (const targetUserId of uniqueUserIds) {
      // Check if permission already exists
      const existingPerm = await db
        .select()
        .from(FolderPermission)
        .where(
          and(
            eq(FolderPermission.folder_id, parseInt(folderId)),
            eq(FolderPermission.user_id, targetUserId)
          )
        )
        .limit(1);

      if (existingPerm.length === 0) {
        const result = await db.insert(FolderPermission).values({
          folder_id: parseInt(folderId),
          user_id: targetUserId,
          permission_type: permissionType || "VIEW",
          shared_by: userId,
          expires_at: expiresAt ? new Date(expiresAt) : null,
        });

        const permId = result[0].insertId;
        const perm = await db
          .select()
          .from(FolderPermission)
          .where(eq(FolderPermission.permission_id, permId))
          .limit(1);

        permissions.push({
          ...perm[0],
          shared_with: "role",
          target_id: targetUserId,
        });
      }
    }
  }

  logger.info(`Folder ${folderId} shared with users/roles by user ${userId}`);

  successResponse(res, "Folder shared successfully", permissions);
});

// Revoke folder access
export const revokeFolderAccess = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { permissionId } = req.params;

  // Check if permission exists and was created by the user
  const permission = await db
    .select()
    .from(FolderPermission)
    .where(
      and(
        eq(FolderPermission.permission_id, parseInt(permissionId)),
        eq(FolderPermission.shared_by, userId)
      )
    )
    .limit(1);

  if (permission.length === 0) {
    throw new NotFoundError(
      "Permission not found or you don't have permission to revoke it"
    );
  }

  await db
    .delete(FolderPermission)
    .where(eq(FolderPermission.permission_id, parseInt(permissionId)));

  logger.info(`Folder permission ${permissionId} revoked by user ${userId}`);

  successResponse(res, "Access revoked successfully", null);
});

// Get folders shared with me
export const getSharedFolders = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;

  const shared = await db
    .select({
      folder: DocumentFolder,
      permission: FolderPermission,
      shared_by_user: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(FolderPermission)
    .innerJoin(
      DocumentFolder,
      eq(FolderPermission.folder_id, DocumentFolder.folder_id)
    )
    .innerJoin(User, eq(FolderPermission.shared_by, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(
      and(
        eq(FolderPermission.user_id, userId),
        or(
          isNull(FolderPermission.expires_at),
          gt(FolderPermission.expires_at, new Date())
        )
      )
    );

  // Add folder owner information
  const sharedWithOwners = await Promise.all(
    shared.map(async (item) => {
      const owner = await db
        .select({
          user_id: User.user_id,
          username: User.username,
          email: User.email,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        })
        .from(User)
        .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
        .where(eq(User.user_id, item.folder.user_id))
        .limit(1);

      return {
        ...item,
        folder_owner: owner[0] || null,
      };
    })
  );

  // Add content counts for each folder
  const sharedWithCounts = await Promise.all(
    sharedWithOwners.map(async (item) => {
      const [subFoldersCount, documentsCount] = await Promise.all([
        // Count subfolders
        db
          .select({ count: sql<number>`count(*)` })
          .from(DocumentFolder)
          .where(
            and(
              eq(DocumentFolder.parent_folder_id, item.folder.folder_id),
              eq(DocumentFolder.user_id, item.folder.user_id) // Only count owner's subfolders
            )
          ),
        // Count documents
        db
          .select({ count: sql<number>`count(*)` })
          .from(Document)
          .where(eq(Document.folder_id, item.folder.folder_id)),
      ]);

      return {
        ...item,
        content_count: {
          folders: subFoldersCount[0].count,
          documents: documentsCount[0].count,
          total: subFoldersCount[0].count + documentsCount[0].count,
        },
      };
    })
  );

  successResponse(
    res,
    "Shared folders retrieved successfully",
    sharedWithCounts
  );
});

// ======================
// DOCUMENT OPERATIONS
// ======================

export const uploadDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { folderId, description, tags } = req.body;
  const file = req.file;

  if (!file) {
    throw new ValidationError("No file uploaded");
  }

  // Validate file size (e.g., 50MB max)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new ValidationError("File size exceeds maximum limit of 50MB");
  }

  // Check if folder exists and belongs to user (if folderId provided)
  if (folderId) {
    const folder = await db
      .select()
      .from(DocumentFolder)
      .where(
        and(
          eq(DocumentFolder.folder_id, parseInt(folderId)),
          eq(DocumentFolder.user_id, userId)
        )
      )
      .limit(1);

    if (folder.length === 0) {
      throw new ValidationError("Folder not found");
    }
  }

  // Generate unique filename
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileName = `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2)}${fileExtension}`;
  const remoteFilePath = `${userId}/${fileName}`;

  try {
    // Upload file buffer to FTP server
    await ftpService.uploadFile(file.buffer, remoteFilePath);

    const result = await db.insert(Document).values({
      user_id: userId,
      folder_id: folderId ? parseInt(folderId) : null,
      file_name: fileName,
      original_name: file.originalname,
      file_path: remoteFilePath,
      file_size: file.size,
      mime_type: file.mimetype,
      file_extension: fileExtension.replace(".", ""),
      description: description ? sanitizeString(description) : null,
      tags: tags ? sanitizeString(tags) : null,
    });

    const documentId = result[0].insertId;

    const document = await db
      .select()
      .from(Document)
      .where(eq(Document.document_id, documentId))
      .limit(1);

    logger.info(`Document uploaded: ${documentId} by user ${userId}`);

    successResponse(res, "Document uploaded successfully", document[0]);
  } catch (error) {
    logger.error("Document upload failed:", error);
    throw error;
  }
});

export const getDocuments = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const {
    folderId,
    search,
    page = 1,
    limit = 20,
    sortBy = "created_at",
    sortOrder = "desc",
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const offset = (pageNum - 1) * limitNum;

  // Build query conditions
  let conditions: any[] = [eq(Document.user_id, userId)];
  let isSharedFolder = false;

  if (folderId) {
    const folderIdNum = parseInt(folderId as string);

    // Check if this is a shared folder
    const sharedFolderCheck = await db
      .select()
      .from(FolderPermission)
      .where(
        and(
          eq(FolderPermission.folder_id, folderIdNum),
          eq(FolderPermission.user_id, userId),
          or(
            isNull(FolderPermission.expires_at),
            gt(FolderPermission.expires_at, new Date())
          )
        )
      )
      .limit(1);

    if (sharedFolderCheck.length > 0) {
      // This is a shared folder, get documents from it
      conditions = [eq(Document.folder_id, folderIdNum)];
      isSharedFolder = true;
    } else {
      // Regular owned folder
      conditions.push(eq(Document.folder_id, folderIdNum));
    }
  } else {
    conditions.push(isNull(Document.folder_id));
  }

  // Get total count
  const allDocuments = await db
    .select()
    .from(Document)
    .where(and(...conditions));

  const total = allDocuments.length;

  // Get documents with sorting - use explicit column references
  let orderByArgs;
  const sortColumn = sortBy as string;
  const sortDir = sortOrder as string;

  if (sortDir === "desc") {
    switch (sortColumn) {
      case "name":
        orderByArgs = desc(Document.original_name);
        break;
      case "size":
        orderByArgs = desc(Document.file_size);
        break;
      case "date":
        orderByArgs = desc(Document.created_at);
        break;
      case "type":
        orderByArgs = desc(Document.file_extension);
        break;
      default:
        orderByArgs = desc(Document.created_at);
    }
  } else {
    switch (sortColumn) {
      case "name":
        orderByArgs = asc(Document.original_name);
        break;
      case "size":
        orderByArgs = asc(Document.file_size);
        break;
      case "date":
        orderByArgs = asc(Document.created_at);
        break;
      case "type":
        orderByArgs = asc(Document.file_extension);
        break;
      default:
        orderByArgs = asc(Document.created_at);
    }
  }

  const documents = await db
    .select({
      document: Document,
      owner: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(Document)
    .innerJoin(User, eq(Document.user_id, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(and(...conditions))
    .orderBy(orderByArgs)
    .limit(limitNum)
    .offset(offset);

  paginatedResponse(res, "Documents retrieved successfully", documents, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

export const getDocumentById = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;

  const document = await db
    .select()
    .from(Document)
    .where(
      and(
        eq(Document.document_id, parseInt(documentId)),
        eq(Document.user_id, userId)
      )
    )
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  successResponse(res, "Document retrieved successfully", document[0]);
});

export const updateDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;
  const { description, tags, is_public, original_name } = req.body;

  // Check if document exists and belongs to user
  const existingDoc = await db
    .select()
    .from(Document)
    .where(
      and(
        eq(Document.document_id, parseInt(documentId)),
        eq(Document.user_id, userId)
      )
    )
    .limit(1);

  if (existingDoc.length === 0) {
    throw new NotFoundError("Document not found");
  }

  const updateData: any = {};
  if (description !== undefined) {
    updateData.description = sanitizeString(description);
  }
  if (tags !== undefined) {
    updateData.tags = sanitizeString(tags);
  }
  if (is_public !== undefined) {
    updateData.is_public = is_public ? 1 : 0;
  }
  if (original_name !== undefined) {
    if (original_name.trim().length === 0) {
      throw new ValidationError("Document name cannot be empty");
    }
    updateData.original_name = sanitizeString(original_name);
  }

  await db
    .update(Document)
    .set(updateData)
    .where(eq(Document.document_id, parseInt(documentId)));

  const updated = await db
    .select()
    .from(Document)
    .where(eq(Document.document_id, parseInt(documentId)))
    .limit(1);

  logger.info(`Document updated: ${documentId} by user ${userId}`);

  successResponse(res, "Document updated successfully", updated[0]);
});

export const deleteDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;

  // Check if document exists and belongs to user
  const document = await db
    .select()
    .from(Document)
    .where(
      and(
        eq(Document.document_id, parseInt(documentId)),
        eq(Document.user_id, userId)
      )
    )
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  // Delete physical file from FTP
  try {
    await ftpService.deleteFile(document[0].file_path);
  } catch (error) {
    logger.warn(`Failed to delete file from FTP: ${document[0].file_path}`);
  }

  // Delete document versions
  await db
    .delete(DocumentVersion)
    .where(eq(DocumentVersion.document_id, parseInt(documentId)));

  // Delete document permissions
  await db
    .delete(DocumentPermission)
    .where(eq(DocumentPermission.document_id, parseInt(documentId)));

  // Delete document
  await db
    .delete(Document)
    .where(eq(Document.document_id, parseInt(documentId)));

  logger.info(`Document deleted: ${documentId} by user ${userId}`);

  successResponse(res, "Document deleted successfully", null);
});

export const downloadDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;

  const document = await db
    .select()
    .from(Document)
    .where(eq(Document.document_id, parseInt(documentId)))
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  // Check if user has access to the document
  const hasAccess =
    document[0].user_id === userId ||
    document[0].is_public === 1 ||
    (await checkDocumentPermission(parseInt(documentId), userId, "DOWNLOAD"));

  if (!hasAccess) {
    throw new AuthenticationError(
      "You don't have permission to download this document"
    );
  }

  try {
    // Create a temporary local file path for download
    const tempDir = path.join(process.env.UPLOAD_PATH || "./uploads", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(
      tempDir,
      `download-${Date.now()}-${document[0].file_name}`
    );

    // Download file from FTP to temp location
    await ftpService.downloadFile(document[0].file_path, tempFilePath);

    logger.info(`Document downloaded: ${documentId} by user ${userId}`);

    // Send file and clean up temp file after response
    res.download(tempFilePath, document[0].original_name, (err: any) => {
      // Clean up temp file after download
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        logger.warn("Failed to clean up temp download file:", cleanupError);
      }
    });
  } catch (error) {
    logger.error("FTP download failed:", error);
    throw new NotFoundError("File not found on server");
  }
});

// ======================
// VERSION OPERATIONS
// ======================

export const uploadNewVersion = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;
  const { changeDescription } = req.body;
  const file = req.file;

  if (!file) {
    throw new ValidationError("No file uploaded");
  }

  // Check if document exists and belongs to user
  const document = await db
    .select()
    .from(Document)
    .where(
      and(
        eq(Document.document_id, parseInt(documentId)),
        eq(Document.user_id, userId)
      )
    )
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  // Get current latest version number
  const latestVersion = await db
    .select()
    .from(DocumentVersion)
    .where(eq(DocumentVersion.document_id, parseInt(documentId)))
    .orderBy(desc(DocumentVersion.version_number))
    .limit(1);

  const newVersionNumber =
    latestVersion.length > 0 ? latestVersion[0].version_number + 1 : 1;

  // Generate unique filename
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileName = `${Date.now()}-v${newVersionNumber}-${Math.random()
    .toString(36)
    .substring(2)}${fileExtension}`;
  const filePath = path.join(
    userId.toString(),
    "versions",
    documentId.toString(),
    fileName
  );

  try {
    // Upload file buffer to FTP server
    await ftpService.uploadFile(file.buffer, filePath);

    // Save version
    const result = await db.insert(DocumentVersion).values({
      document_id: parseInt(documentId),
      user_id: userId,
      version_number: newVersionNumber,
      file_name: fileName,
      file_path: filePath,
      file_size: file.size,
      change_description: changeDescription
        ? sanitizeString(changeDescription)
        : null,
    });

    const versionId = result[0].insertId;

    const version = await db
      .select()
      .from(DocumentVersion)
      .where(eq(DocumentVersion.version_id, versionId))
      .limit(1);

    logger.info(
      `New version uploaded: ${documentId} v${newVersionNumber} by user ${userId}`
    );

    successResponse(res, "New version uploaded successfully", version[0]);
  } catch (error) {
    logger.error("Version upload failed:", error);
    throw error;
  }
});

export const getDocumentVersions = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;

  // Check if document exists and user has access
  const document = await db
    .select()
    .from(Document)
    .where(eq(Document.document_id, parseInt(documentId)))
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  if (document[0].user_id !== userId) {
    throw new AuthenticationError(
      "You don't have permission to view this document's versions"
    );
  }

  const versions = await db
    .select()
    .from(DocumentVersion)
    .where(eq(DocumentVersion.document_id, parseInt(documentId)))
    .orderBy(desc(DocumentVersion.version_number));

  successResponse(res, "Versions retrieved successfully", versions);
});

// Get document permissions (who it's shared with)
export const getDocumentPermissions = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const { documentId } = req.params;

    // Check if document exists and belongs to user
    const document = await db
      .select()
      .from(Document)
      .where(
        and(
          eq(Document.document_id, parseInt(documentId)),
          eq(Document.user_id, userId)
        )
      )
      .limit(1);

    if (document.length === 0) {
      throw new NotFoundError("Document not found");
    }

    // Get user permissions with user details
    const userPermissions = await db
      .select({
        permission_id: DocumentPermission.permission_id,
        user_id: DocumentPermission.user_id,
        permission_type: DocumentPermission.permission_type,
        expires_at: DocumentPermission.expires_at,
        created_at: DocumentPermission.created_at,
        shared_by: DocumentPermission.shared_by,
        shared_with: DocumentPermission.shared_with,
        user: {
          user_id: User.user_id,
          username: User.username,
          email: User.email,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        },
      })
      .from(DocumentPermission)
      .innerJoin(User, eq(DocumentPermission.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(eq(DocumentPermission.document_id, parseInt(documentId)));

    // Get role permissions for this document
    const rolePermissions = await db
      .select({
        permission_id: DocumentPermission.permission_id,
        document_id: DocumentPermission.document_id,
        user_id: DocumentPermission.user_id,
        permission_type: DocumentPermission.permission_type,
        expires_at: DocumentPermission.expires_at,
        created_at: DocumentPermission.created_at,
        shared_by: DocumentPermission.shared_by,
        role: {
          role_id: Role.role_id,
          name: Role.name,
          description: Role.description,
        },
        user: {
          user_id: User.user_id,
          username: User.username,
          email: User.email,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        },
      })
      .from(DocumentPermission)
      .innerJoin(User, eq(DocumentPermission.user_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(UserRole, eq(DocumentPermission.user_id, UserRole.user_id))
      .innerJoin(Role, eq(UserRole.role_id, Role.role_id))
      .where(
        and(
          eq(DocumentPermission.document_id, parseInt(documentId)),
          eq(DocumentPermission.shared_with, "role")
        )
      );

    // Group role permissions by role
    const rolePermissionsMap = new Map();
    for (const perm of rolePermissions) {
      if (!rolePermissionsMap.has(perm.role.role_id)) {
        rolePermissionsMap.set(perm.role.role_id, {
          role: perm.role,
          users: [],
          permission_type: perm.permission_type,
          permission_id: perm.permission_id,
        });
      }
      rolePermissionsMap.get(perm.role.role_id).users.push(perm.user);
    }

    const rolePermissionsList = Array.from(rolePermissionsMap.values());

    successResponse(res, "Permissions retrieved successfully", {
      userPermissions,
      rolePermissions: rolePermissionsList,
    });
  }
);

// ======================
// SHARING OPERATIONS
// ======================

export const shareDocument = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { documentId } = req.params;
  const { userIds, roleIds, permissionType, expiresAt } = req.body;

  if (
    (!userIds || !Array.isArray(userIds) || userIds.length === 0) &&
    (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0)
  ) {
    throw new ValidationError("At least one user ID or role ID is required");
  }

  // Check if document exists and belongs to user
  const document = await db
    .select()
    .from(Document)
    .where(
      and(
        eq(Document.document_id, parseInt(documentId)),
        eq(Document.user_id, userId)
      )
    )
    .limit(1);

  if (document.length === 0) {
    throw new NotFoundError("Document not found");
  }

  const permissions = [];

  // Share with users
  if (userIds && userIds.length > 0) {
    for (const targetUserId of userIds) {
      const result = await db.insert(DocumentPermission).values({
        document_id: parseInt(documentId),
        user_id: targetUserId,
        permission_type: permissionType || "VIEW",
        shared_by: userId,
        shared_with: "user",
        expires_at: expiresAt ? new Date(expiresAt) : null,
      });

      const permId = result[0].insertId;
      const perm = await db
        .select()
        .from(DocumentPermission)
        .where(eq(DocumentPermission.permission_id, permId))
        .limit(1);

      permissions.push({
        ...perm[0],
        shared_with: "user",
        target_id: targetUserId,
      });
    }
  }

  // Share with roles
  if (roleIds && roleIds.length > 0) {
    // Get all users in these roles
    const usersInRoles = await db
      .select({
        user_id: UserRole.user_id,
        role_id: UserRole.role_id,
      })
      .from(UserRole)
      .where(
        inArray(
          UserRole.role_id,
          roleIds.map((id: string) => parseInt(id))
        )
      );

    // Get unique user IDs
    const uniqueUserIds = [...new Set(usersInRoles.map((ur) => ur.user_id))];

    for (const targetUserId of uniqueUserIds) {
      // Check if permission already exists
      const existingPerm = await db
        .select()
        .from(DocumentPermission)
        .where(
          and(
            eq(DocumentPermission.document_id, parseInt(documentId)),
            eq(DocumentPermission.user_id, targetUserId)
          )
        )
        .limit(1);

      if (existingPerm.length === 0) {
        const result = await db.insert(DocumentPermission).values({
          document_id: parseInt(documentId),
          user_id: targetUserId,
          permission_type: permissionType || "VIEW",
          shared_by: userId,
          shared_with: "role",
          expires_at: expiresAt ? new Date(expiresAt) : null,
        });

        const permId = result[0].insertId;
        const perm = await db
          .select()
          .from(DocumentPermission)
          .where(eq(DocumentPermission.permission_id, permId))
          .limit(1);

        // Find which roles this user was shared with
        const userRoles = usersInRoles
          .filter((ur) => ur.user_id === targetUserId)
          .map((ur) => ur.role_id);

        permissions.push({
          ...perm[0],
          shared_with: "role",
          target_id: userRoles,
          role_ids: roleIds,
        });
      }
    }
  }

  logger.info(
    `Document ${documentId} shared with users/roles by user ${userId}`
  );

  successResponse(res, "Document shared successfully", permissions);
});

export const getSharedDocuments = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;

  const shared = await db
    .select({
      document: Document,
      permission: DocumentPermission,
      shared_by_user: {
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      },
    })
    .from(DocumentPermission)
    .innerJoin(
      Document,
      eq(DocumentPermission.document_id, Document.document_id)
    )
    .innerJoin(User, eq(DocumentPermission.shared_by, User.user_id))
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(
      and(
        eq(DocumentPermission.user_id, userId),
        or(
          isNull(DocumentPermission.expires_at),
          gt(DocumentPermission.expires_at, new Date())
        )
      )
    );

  successResponse(res, "Shared documents retrieved successfully", shared);
});

export const revokeDocumentAccess = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { permissionId } = req.params;

  // Check if permission exists and was created by the user
  const permission = await db
    .select()
    .from(DocumentPermission)
    .where(
      and(
        eq(DocumentPermission.permission_id, parseInt(permissionId)),
        eq(DocumentPermission.shared_by, userId)
      )
    )
    .limit(1);

  if (permission.length === 0) {
    throw new NotFoundError(
      "Permission not found or you don't have permission to revoke it"
    );
  }

  await db
    .delete(DocumentPermission)
    .where(eq(DocumentPermission.permission_id, parseInt(permissionId)));

  logger.info(`Document permission ${permissionId} revoked by user ${userId}`);

  successResponse(res, "Access revoked successfully", null);
});

// ======================
// HELPER FUNCTIONS
// ======================

async function checkDocumentPermission(
  documentId: number,
  userId: number,
  requiredPermission: "VIEW" | "EDIT" | "DOWNLOAD" | "SHARE"
): Promise<boolean> {
  const permission = await db
    .select()
    .from(DocumentPermission)
    .where(
      and(
        eq(DocumentPermission.document_id, documentId),
        eq(DocumentPermission.user_id, userId),
        eq(DocumentPermission.permission_type, requiredPermission)
      )
    )
    .limit(1);

  return permission.length > 0;
}
