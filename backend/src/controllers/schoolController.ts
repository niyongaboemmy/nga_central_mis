import { isTenantUsable, runWithTenant } from "../vendor/nga-tenancy";
import { findTenant } from "../tenancy/registry";
import { Request, Response } from "express";
import { db } from "../db";
import { School } from "../db/schema";
import { asc, eq } from "drizzle-orm";
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
      documents_logo,
      district,
      head_teacher_name,
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
      documents_logo: documents_logo || null,
      district: district || null,
      head_teacher_name: head_teacher_name || null,
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
      documents_logo,
      district,
      head_teacher_name,
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
        documents_logo: documents_logo !== undefined ? documents_logo || null : undefined,
        district: district !== undefined ? district || null : undefined,
        head_teacher_name: head_teacher_name !== undefined ? head_teacher_name || null : undefined,
      })
      .where(eq(School.school_id, Number(id)));

    res.status(200).json({ message: "School updated successfully" });
  } catch (error) {
    console.error("Error updating school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── The school's identity block (report cards and other documents) ─────────
// Each tenant has its own MIS database, so "the school" is that database's
// active School (the lowest id when there are several). Spokes (Task Mentor's
// report cards) read it from GET /schools/profile and edit it with PUT, so a
// school's name, district, contacts, trade/sector/qualification and head of
// school are kept in one place.

/** Fields PUT /schools/profile accepts, with their maximum lengths (the column sizes). */
export const PROFILE_FIELDS: Record<string, number> = {
  name: 150,
  address: 255,
  district: 100,
  contact_email: 150,
  contact_phone: 50,
  sector: 100,
  trade: 150,
  qualification_title: 255,
  head_teacher_name: 150,
};

const profileSchool = async () => {
  const rows = await db.select().from(School).orderBy(asc(School.school_id));
  return rows.find((r: any) => r.status === "ACTIVE") ?? rows[0] ?? null;
};

const profileOf = (school: any, req: Request) => {
  const base = `${req.protocol}://${req.get("host")}`;
  return {
    school_id: school.school_id,
    name: school.name,
    school_code: school.school_code ?? null,
    address: school.address ?? null,
    district: school.district ?? null,
    contact_email: school.contact_email ?? null,
    contact_phone: school.contact_phone ?? null,
    sector: school.sector ?? null,
    trade: school.trade ?? null,
    qualification_title: school.qualification_title ?? null,
    head_teacher_name: school.head_teacher_name ?? null,
    logo_url: school.logo ? `${base}/schools/${school.school_id}/logo/primary` : null,
    documents_logo_url: school.documents_logo ? `${base}/schools/${school.school_id}/logo/documents` : null,
    updated_at: school.updated_at ?? null,
  };
};

/** GET /schools/profile -- any signed-in user (it's what the school prints on its documents). */
export const getSchoolProfile = async (req: Request, res: Response) => {
  try {
    const school = await profileSchool();
    if (!school) return res.status(404).json({ message: "No school is set up yet" });
    const canEdit = !!(req as any).user?.permissions?.includes("MANAGE_SCHOOLS");
    res.status(200).json({ data: profileOf(school, req), can_edit: canEdit });
  } catch (error) {
    console.error("Error reading the school profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/** PUT /schools/profile (MANAGE_SCHOOLS) -- only the identity fields; omitted ones stay as they are. */
export const updateSchoolProfile = async (req: Request, res: Response) => {
  try {
    const school = await profileSchool();
    if (!school) return res.status(404).json({ message: "No school is set up yet" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, string | null> = {};
    for (const [field, max] of Object.entries(PROFILE_FIELDS)) {
      if (!(field in body)) continue;
      const v = body[field];
      if (v != null && typeof v !== "string") return res.status(400).json({ message: `${field} must be text` });
      const t = (v ?? "").trim();
      if (t.length > max) return res.status(400).json({ message: `${field} is at most ${max} characters` });
      if (field === "name" && !t) return res.status(400).json({ message: "The school needs a name" });
      if (field === "contact_email" && t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return res.status(400).json({ message: "That email address doesn't look right" });
      patch[field] = t || null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ message: "Nothing to update" });
    if (patch.name && patch.name !== school.name) {
      const clash = await db.select().from(School).where(eq(School.name, patch.name));
      if (clash.length) return res.status(400).json({ message: "Another school already has this name" });
    }
    await db.update(School).set(patch as any).where(eq(School.school_id, school.school_id));
    const [fresh] = await db.select().from(School).where(eq(School.school_id, school.school_id));
    res.status(200).json({ message: "School profile saved", data: profileOf(fresh, req) });
  } catch (error) {
    console.error("Error saving the school profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

type LogoSlot = "primary" | "partner" | "documents";

const LOGO_SLOT_COLUMN: Record<LogoSlot, "logo" | "partner_logo" | "documents_logo"> = {
  primary: "logo",
  partner: "partner_logo",
  documents: "documents_logo",
};

const parseLogoSlot = (value: unknown): LogoSlot =>
  value === "partner" ? "partner" : value === "documents" ? "documents" : "primary";

/**
 * Uploads a logo image and stores its file-server path on School.logo (`slot: "primary"`, the
 * default), School.partner_logo (`slot: "partner"`), or School.documents_logo
 * (`slot: "documents"`). `logo`/`partner_logo` are the Scheme of Work PDF's two cover-page logo
 * slots; `documents_logo` is the separate mark used in the running header repeated on every page
 * of reports/documents (e.g. the Scheme of Work PDF header) -- schools may want a simplified
 * version there rather than reusing a cover-page logo. Stored as a remote file-server path (same
 * convention as SubjectDocument.file_path elsewhere in the app), not a full URL --
 * schemeReportPdf.ts resolves it at render time.
 */
export const uploadSchoolLogo = async (req: Request & { file?: Express.Multer.File }, res: Response) => {
  try {
    const { id } = req.params;
    const slot = parseLogoSlot(req.body.slot);

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
      .set({ [LOGO_SLOT_COLUMN[slot]]: remotePath })
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
  // Public: a cookie must not decide which school's logo this is. ?tenant=<slug|tid>
  // (from GET /tenant/branding) names the school; without it, NGA / the caller's school.
  const ref = req.query.tenant;
  if (typeof ref === "string" && ref) {
    const tenant = await findTenant(ref).catch(() => null);
    // Usable schools only (see GET /tenant/branding): no logos of pending / suspended / archived ones.
    if (!tenant || !isTenantUsable(tenant.status)) return res.status(404).json({ message: "School not found" });
    (req as any).tenant = tenant;
    return runWithTenant(tenant, () => serveSchoolLogo(req, res));
  }
  return serveSchoolLogo(req, res);
};

const serveSchoolLogo = async (req: Request, res: Response) => {
  try {
    const { id, slot } = req.params;
    if (slot !== "primary" && slot !== "partner" && slot !== "documents") {
      return res.status(400).json({ message: "slot must be 'primary', 'partner', or 'documents'" });
    }

    const [school] = await db
      .select()
      .from(School)
      .where(eq(School.school_id, Number(id)));

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    const value = school[LOGO_SLOT_COLUMN[slot]];
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
