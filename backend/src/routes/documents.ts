import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate } from "../middleware/auth";
import {
  createFolder,
  getFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
  uploadDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  downloadDocument,
  uploadNewVersion,
  getDocumentVersions,
  getDocumentPermissions,
  shareDocument,
  getSharedDocuments,
  revokeDocumentAccess,
  getAllRoles,
  getUsersByRole,
  getFolderPermissions,
  shareFolder,
  revokeFolderAccess,
  getSharedFolders,
} from "../controllers/documentController";

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.env.UPLOAD_PATH || "./uploads", "temp");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// All routes require authentication
router.use(authenticate);

// ======================
// ROLE ROUTES
// ======================

// Get all roles
router.get("/roles", getAllRoles);

// Get users by role ID
router.get("/roles/:roleId/users", getUsersByRole);

// ======================
// FOLDER ROUTES
// ======================

// Create a new folder
router.post("/folders", createFolder);

// Get all folders (with optional parentFolderId query)
router.get("/folders", getFolders);

// Get a specific folder
router.get("/folders/:folderId", getFolderById);

// Update a folder
router.put("/folders/:folderId", updateFolder);

// Delete a folder
router.delete("/folders/:folderId", deleteFolder);

// ======================
// FOLDER SHARING ROUTES
// ======================

// Get folder permissions
router.get("/folders/:folderId/permissions", getFolderPermissions);

// Share a folder with users or roles
router.post("/folders/:folderId/share", shareFolder);

// Revoke folder access
router.delete("/folders/permissions/:permissionId", revokeFolderAccess);

// Get folders shared with me
router.get("/shared/folders", getSharedFolders);

// ======================
// DOCUMENT ROUTES
// ======================

// Upload a new document
router.post("/upload", upload.single("file"), uploadDocument);

// Get all documents (with optional folderId, search, pagination)
router.get("/", getDocuments);

// Get documents in a specific folder
router.get("/folder/:folderId", getDocuments);

// Get a specific document
router.get("/:documentId", getDocumentById);

// Update document metadata
router.put("/:documentId", updateDocument);

// Delete a document
router.delete("/:documentId", deleteDocument);

// Download a document
router.get("/:documentId/download", downloadDocument);

// ======================
// VERSION ROUTES
// ======================

// Upload a new version of a document
router.post("/:documentId/versions", upload.single("file"), uploadNewVersion);

// Get all versions of a document
router.get("/:documentId/versions", getDocumentVersions);

// ======================
// SHARING ROUTES
// ======================

// Get document permissions (who it's shared with)
router.get("/:documentId/permissions", getDocumentPermissions);

// Share a document with users or roles
router.post("/:documentId/share", shareDocument);

// Get documents shared with me
router.get("/shared/with-me", getSharedDocuments);

// Revoke document access
router.delete("/permissions/:permissionId", revokeDocumentAccess);

export default router;
