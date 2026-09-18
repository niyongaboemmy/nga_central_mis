import { Request, Response } from "express";
import { db } from "../db";
import { School } from "../db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import storageService from "../utils/fileServer";

export const createSchool = async (req: Request, res: Response) => {
  try {
    const {
      name,
      school_code,
      address,
      contact_email,
      contact_phone,
      logo,
      sector,
      trade,
      qualification_title,
    } = req.body;

    const existingSchool = await db
      .select()
      .from(School)
      .where(eq(School.name, name));

    if (existingSchool.length > 0) {
      return res
        .status(400)
        .json({ message: "School with this name already exists" });
    }

    if (school_code) {
      const codeCheck = await db
        .select()
        .from(School)
        .where(eq(School.school_code, school_code));
      if (codeCheck.length > 0) {
        return res
          .status(400)
          .json({ message: "School with this school code already exists" });
      }
    }

    await db.insert(School).values({
      name,
      school_code,
      address,
      contact_email,
      contact_phone,
      logo,
      sector: sector || null,
      trade: trade || null,
      qualification_title: qualification_title || null,
    });

    res.status(201).json({ message: "School created successfully" });
  } catch (error) {
    console.error("Error creating school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllSchools = async (req: Request, res: Response) => {
  try {
    const schools = await db.select().from(School);
    res.status(200).json(schools);
  } catch (error) {
    console.error("Error fetching schools:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSchoolById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const schools = await db
      .select()
      .from(School)
      .where(eq(School.school_id, Number(id)));

    if (schools.length === 0) {
      return res.status(404).json({ message: "School not found" });
    }

    res.status(200).json(schools[0]);
  } catch (error) {
    console.error("Error fetching school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateSchool = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      school_code,
      address,
      contact_email,
      contact_phone,
      logo,
      status,
      sector,
      trade,
      qualification_title,
    } = req.body;

    const existingSchool = await db
      .select()
      .from(School)
      .where(eq(School.school_id, Number(id)));

    if (existingSchool.length === 0) {
      return res.status(404).json({ message: "School not found" });
    }

    // Check name collision if name is changing
    if (name && name !== existingSchool[0].name) {
      const nameCheck = await db
        .select()
        .from(School)
        .where(eq(School.name, name));
      if (nameCheck.length > 0) {
        return res
          .status(400)
          .json({ message: "School with this name already exists" });
      }
    }

    // Check school code collision if it's changing
    if (school_code && school_code !== existingSchool[0].school_code) {
      const codeCheck = await db
        .select()
        .from(School)
        .where(eq(School.school_code, school_code));
      if (codeCheck.length > 0) {
        return res
          .status(400)
          .json({ message: "School with this school code already exists" });
      }
    }

    await db
      .update(School)
      .set({
        name,
        school_code,
        address,
        contact_email,
        contact_phone,
        logo,
        status,
        sector: sector !== undefined ? sector || null : undefined,
        trade: trade !== undefined ? trade || null : undefined,
        qualification_title:
          qualification_title !== undefined ? qualification_title || null : undefined,
      })
      .where(eq(School.school_id, Number(id)));

    res.status(200).json({ message: "School updated successfully" });
  } catch (error) {
    console.error("Error updating school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Uploads a logo image and stores its file-server path on School.logo (`slot: "primary"`, the
 * default) or School.partner_logo (`slot: "partner"`) -- used for the Scheme of Work PDF's two
 * cover-page logo slots (both dynamic, per product decision). Stored as a remote file-server path
 * (same convention as SubjectDocument.file_path elsewhere in the app), not a full URL --
 * schemeReportPdf.ts resolves it at render time.
 */
export const uploadSchoolLogo = async (req: Request & { file?: Express.Multer.File }, res: Response) => {
  try {
    const { id } = req.params;
    const slot = req.body.slot === "partner" ? "partner" : "primary";

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const existingSchool = await db
      .select()
      .from(School)
      .where(eq(School.school_id, Number(id)));

    if (existingSchool.length === 0) {
      return res.status(404).json({ message: "School not found" });
    }

    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const remotePath = `schools/${id}/logo-${slot}-${Date.now()}${ext}`;

    await storageService.uploadFile(req.file.buffer, remotePath);

    await db
      .update(School)
      .set(slot === "partner" ? { partner_logo: remotePath } : { logo: remotePath })
      .where(eq(School.school_id, Number(id)));

    res.status(200).json({ message: "Logo uploaded successfully", path: remotePath, slot });
  } catch (error) {
    console.error("Error uploading school logo:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Public (unauthenticated) image proxy for a school's logo -- lets a plain <img src> tag load it
 * directly (the admin form preview, or anywhere else in the app) without needing to attach a
 * bearer token. Logos are institutional branding, not sensitive data. Streams the bytes from the
 * file-server for a stored remote path; redirects straight through for a plain http(s) URL (the
 * shape School.logo/partner_logo had before the upload endpoint existed).
 */
export const getSchoolLogo = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    if (slot !== "primary" && slot !== "partner") {
      return res.status(400).json({ message: "slot must be 'primary' or 'partner'" });
    }

    const [school] = await db
      .select()
      .from(School)
      .where(eq(School.school_id, Number(id)));

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    const value = slot === "partner" ? school.partner_logo : school.logo;
    if (!value) {
      return res.status(404).json({ message: "No logo set for this slot" });
    }

    if (/^https?:\/\//i.test(value)) {
      return res.redirect(value);
    }

    const ext = path.extname(value).toLowerCase();
    const mime =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".svg"
          ? "image/svg+xml"
          : ext === ".webp"
            ? "image/webp"
            : "image/png";

    const buffer = await storageService.downloadToBuffer(value);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(buffer);
  } catch (error) {
    console.error("Error serving school logo:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteSchool = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Soft delete or hard delete? Usually soft delete is better, keeping logic consistent with schema ENUM
    // Schema has 'INACTIVE' or 'SUSPENDED', no specific 'DELETED' but let's assume we can change status or hard delete if no refs.
    // For now, let's just set to INACTIVE.

    await db
      .update(School)
      .set({ status: "INACTIVE" })
      .where(eq(School.school_id, Number(id)));

    res.status(200).json({ message: "School deactivated successfully" });
  } catch (error) {
    console.error("Error deleting school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
