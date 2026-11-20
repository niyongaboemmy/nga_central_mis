import { isTenantUsable, runWithTenant } from "../vendor/nga-tenancy";
import { findTenant } from "../tenancy/registry";
import { Request, Response } from "express";
import { db } from "../db";
import { School } from "../db/schema";
import { asc, eq } from "drizzle-orm";
import path from "path";
import storageService from "../utils/fileServer";

// ─── Validation shared by create and update ─────────────────────────────────
// Logos are never taken from these bodies: they are file-server paths written only by
// POST /schools/:id/logo. (The edit form used to send a placeholder "uploaded" back on
// Save, which replaced NGA's real logo path and broke the logo everywhere.)

/** Column sizes (schema.ts School). */
export const SCHOOL_LIMITS: Record<string, number> = {
  name: 150,
  school_code: 20,
  address: 255,
  district: 100,
  contact_email: 150,
  contact_phone: 50,
  sector: 100,
  trade: 150,
  qualification_title: 255,
  head_teacher_name: 150,
};
export const SCHOOL_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,24}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/;

type SchoolValues = Partial<Record<keyof typeof SCHOOL_LIMITS | "status", string | null>>;

/** Trims and checks every known field present in `body`; unknown fields (logos included) are ignored. */
export function readSchoolBody(body: Record<string, unknown>, creating: boolean): { values: SchoolValues; errors: Record<string, string> } {
  const values: SchoolValues = {};
  const errors: Record<string, string> = {};
  for (const [field, max] of Object.entries(SCHOOL_LIMITS)) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw != null && typeof raw !== "string") {
      errors[field] = "must be text";
      continue;
    }
    const v = (raw ?? "").trim().replace(/\s+/g, " ");
    if (v.length > max) errors[field] = `is at most ${max} characters`;
    else if (field === "contact_email" && v && !EMAIL_RE.test(v)) errors[field] = "doesn't look like an email address";
    else if (field === "contact_phone" && v && (!PHONE_RE.test(v) || v.replace(/\D/g, "").length < 7 || v.replace(/\D/g, "").length > 15))
      errors[field] = "should be a phone number such as +250 788 000 000";
    else if (field === "school_code" && v && !CODE_RE.test(v)) errors[field] = "uses 2-20 letters, digits or dashes";
    values[field as keyof typeof SCHOOL_LIMITS] = v || null;
  }
  if (creating || "name" in body) {
    if (!values.name) errors.name = "is required";
    else if (values.name.length < 2) errors.name = "is too short";
  }
  if ("status" in body) {
    if (!SCHOOL_STATUSES.includes(body.status as any)) errors.status = `must be one of ${SCHOOL_STATUSES.join(", ")}`;
    else values.status = body.status as string;
  }
  return { values, errors };
}

const LABELS: Record<string, string> = {
  name: "School name",
  school_code: "School code",
  contact_email: "Contact email",
  contact_phone: "Contact phone",
  head_teacher_name: "Head of school",
  qualification_title: "Qualification title",
  status: "Status",
};
const labelOf = (f: string) => LABELS[f] ?? f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, " ");

const refuseInvalid = (res: Response, errors: Record<string, string>) => {
  const [field, msg] = Object.entries(errors)[0];
  return res.status(400).json({ message: `${labelOf(field)} ${msg}`, field, errors });
};

/** Another school (not `exceptId`) already using this name / code, compared without case. */
async function clashes(values: SchoolValues, exceptId?: number): Promise<{ field: string; message: string } | null> {
  const others = (await db.select().from(School)).filter((r: any) => r.school_id !== exceptId);
  const same = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  if (values.name && others.some((r: any) => same(r.name, values.name))) return { field: "name", message: "Another school already has this name" };
  if (values.school_code && others.some((r: any) => same(r.school_code, values.school_code)))
    return { field: "school_code", message: "Another school already uses this school code" };
  return null;
}

const activeCount = async (exceptId?: number) =>
  (await db.select().from(School)).filter((r: any) => r.status === "ACTIVE" && r.school_id !== exceptId).length;

const LAST_ACTIVE =
  "This is the school's only active record: sign-in, branding and report cards depend on it. Activate or add another school first.";

export const createSchool = async (req: Request, res: Response) => {
  try {
    const { values, errors } = readSchoolBody(req.body ?? {}, true);
    if (Object.keys(errors).length) return refuseInvalid(res, errors);
    const clash = await clashes(values);
    if (clash) return res.status(409).json({ message: clash.message, field: clash.field });
    const [result]: any = await db.insert(School).values({ ...(values as any), status: values.status ?? "ACTIVE" });
    const [created] = await db.select().from(School).where(eq(School.school_id, Number(result?.insertId)));
    res.status(201).json({ message: "School created", data: created ?? null });
  } catch (error) {
    console.error("Error creating school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllSchools = async (req: Request, res: Response) => {
  try {
    const schools = await db.select().from(School).orderBy(asc(School.school_id));
    res.status(200).json(schools.map(withLogoState));
  } catch (error) {
    console.error("Error fetching schools:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSchoolById = async (req: Request, res: Response) => {
  try {
    const schools = await db
      .select()
      .from(School)
      .where(eq(School.school_id, Number(req.params.id)));
    if (schools.length === 0) return res.status(404).json({ message: "School not found" });
    res.status(200).json(withLogoState(schools[0]));
  } catch (error) {
    console.error("Error fetching school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateSchool = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(School).where(eq(School.school_id, id));
    if (!existing) return res.status(404).json({ message: "School not found" });
    const { values, errors } = readSchoolBody(req.body ?? {}, false);
    if (Object.keys(errors).length) return refuseInvalid(res, errors);
    if (!Object.keys(values).length) return res.status(400).json({ message: "Nothing to update" });
    const clash = await clashes(values, id);
    if (clash) return res.status(409).json({ message: clash.message, field: clash.field });
    if (values.status && values.status !== "ACTIVE" && existing.status === "ACTIVE" && !(await activeCount(id)))
      return res.status(409).json({ message: LAST_ACTIVE, field: "status" });
    await db.update(School).set(values as any).where(eq(School.school_id, id));
    const [fresh] = await db.select().from(School).where(eq(School.school_id, id));
    res.status(200).json({ message: "School updated", data: withLogoState(fresh) });
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
    logo_url: isServableLogo(school.logo) ? `${base}/schools/${school.school_id}/logo/primary` : null,
    documents_logo_url: isServableLogo(school.documents_logo) ? `${base}/schools/${school.school_id}/logo/documents` : null,
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

const parseLogoSlot = (value: unknown): LogoSlot | null =>
  value === undefined || value === "" || value === "primary"
    ? "primary"
    : value === "partner" || value === "documents"
      ? value
      : null;

/** A stored logo that can really be served: a file-server image path or an http(s) URL. */
export const isServableLogo = (v: unknown): v is string =>
  typeof v === "string" && !v.includes("..") && (/^https?:\/\/\S+$/i.test(v) || /^[\w./-]+\.(png|jpe?g|svg|webp)$/i.test(v));

/** A School row as the API returns it: unusable logo values read as "no logo", plus a cache key. */
export function withLogoState<T extends Record<string, any>>(row: T): T & { logo_version: number | null } {
  if (!row) return row as any;
  const out: any = { ...row };
  for (const col of Object.values(LOGO_SLOT_COLUMN)) if (!isServableLogo(out[col])) out[col] = null;
  const t = row.updated_at ? new Date(row.updated_at).getTime() : NaN;
  out.logo_version = Number.isFinite(t) ? t : null;
  return out;
}

type ImageKind = { ext: ".png" | ".jpg" | ".webp" | ".svg"; mime: string };

/**
 * What the uploaded bytes really are (the extension alone is not trusted). SVGs are
 * text and can carry scripts, so one with scripts, event handlers, external
 * references or embedded HTML is refused rather than served from the API origin.
 */
export function sniffImage(buf: Buffer): ImageKind | { error: string } {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: ".png", mime: "image/png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: ".jpg", mime: "image/jpeg" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: ".webp", mime: "image/webp" };
  const head = buf.toString("utf8", 0, Math.min(buf.length, 4096)).replace(/^\uFEFF/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    const text = buf.toString("utf8");
    if (/<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:|<!ENTITY|(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|data:text)/i.test(text))
      return { error: "This SVG contains scripts or external content. Export it as a plain SVG or a PNG." };
    return { ext: ".svg", mime: "image/svg+xml" };
  }
  return { error: "Only PNG, JPG, WEBP and SVG images are supported" };
}

/**
 * Uploads a logo image and stores its file-server path on School.logo (`slot: "primary"`, the
 * default), School.partner_logo (`slot: "partner"`), or School.documents_logo
 * (`slot: "documents"`). `logo`/`partner_logo` are the Scheme of Work PDF's two cover-page logo
 * slots, and `logo` is also the app's logo for everyone signed in to this school;
 * `documents_logo` is the mark in the running header of reports/documents. Stored as a remote
 * file-server path (resolved at render time), never a full URL.
 */
export const uploadSchoolLogo = async (req: Request & { file?: Express.Multer.File }, res: Response) => {
  try {
    const id = Number(req.params.id);
    const slot = parseLogoSlot(req.body?.slot);
    if (!slot) return res.status(400).json({ message: "slot must be 'primary', 'partner', or 'documents'" });
    if (!req.file?.buffer?.length) return res.status(400).json({ message: "Choose an image to upload" });

    const [existing] = await db.select().from(School).where(eq(School.school_id, id));
    if (!existing) return res.status(404).json({ message: "School not found" });

    const kind = sniffImage(req.file.buffer);
    if ("error" in kind) return res.status(400).json({ message: kind.error });

    const remotePath = `schools/${id}/logo-${slot}-${Date.now()}${kind.ext}`;
    await storageService.uploadFile(req.file.buffer, remotePath);
    // Bump updated_at explicitly: it is the logo's cache key (logo_version).
    await db
      .update(School)
      .set({ [LOGO_SLOT_COLUMN[slot]]: remotePath, updated_at: new Date() } as any)
      .where(eq(School.school_id, id));
    const [fresh] = await db.select().from(School).where(eq(School.school_id, id));
    res.status(200).json({ message: "Logo uploaded", path: remotePath, slot, data: withLogoState(fresh) });
  } catch (error) {
    console.error("Error uploading school logo:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/** DELETE /schools/:id/logo/:slot -- clears the slot (the file itself is kept). */
export const removeSchoolLogo = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const slot = parseLogoSlot(req.params.slot);
    if (!slot) return res.status(400).json({ message: "slot must be 'primary', 'partner', or 'documents'" });
    const [existing] = await db.select().from(School).where(eq(School.school_id, id));
    if (!existing) return res.status(404).json({ message: "School not found" });
    await db
      .update(School)
      .set({ [LOGO_SLOT_COLUMN[slot]]: null, updated_at: new Date() } as any)
      .where(eq(School.school_id, id));
    const [fresh] = await db.select().from(School).where(eq(School.school_id, id));
    res.status(200).json({ message: "Logo removed", slot, data: withLogoState(fresh) });
  } catch (error) {
    console.error("Error removing school logo:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Public (unauthenticated) image proxy for a school's logo -- lets a plain <img src> tag load it
 * without a bearer token. Logos are institutional branding, not sensitive data. Streams the bytes
 * from the file-server for a stored remote path; redirects for a plain http(s) URL.
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

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };

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
    if (!school) return res.status(404).json({ message: "School not found" });

    const value = school[LOGO_SLOT_COLUMN[slot]];
    if (!isServableLogo(value)) return res.status(404).json({ message: "No logo set for this slot" });
    if (/^https?:\/\//i.test(value)) return res.redirect(value);

    let buffer: Buffer;
    try {
      buffer = await storageService.downloadToBuffer(value);
    } catch (err: any) {
      if (/\b404\b/.test(String(err?.message))) return res.status(404).json({ message: "The logo file is missing; upload it again" });
      throw err;
    }
    res.setHeader("Content-Type", MIME[path.extname(value).toLowerCase()] ?? "image/png");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // An SVG opened directly must not run anything, even if an old upload had a script in it.
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    // ?v=<logo_version> changes with every upload, so a versioned URL can be kept longer.
    res.setHeader("Cache-Control", req.query.v ? "public, max-age=86400" : "public, max-age=300");
    res.send(buffer);
  } catch (error) {
    console.error("Error serving school logo:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/** DELETE /schools/:id -- deactivates (nothing is deleted); never the school's last active record. */
export const deleteSchool = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(School).where(eq(School.school_id, id));
    if (!existing) return res.status(404).json({ message: "School not found" });
    if (existing.status !== "ACTIVE") return res.status(200).json({ message: "School is already inactive" });
    if (!(await activeCount(id))) return res.status(409).json({ message: LAST_ACTIVE });
    await db.update(School).set({ status: "INACTIVE" }).where(eq(School.school_id, id));
    res.status(200).json({ message: "School deactivated" });
  } catch (error) {
    console.error("Error deactivating school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
