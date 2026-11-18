import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { clip, fail, fullName, insertId, isStudentAccount, iso, many, one } from "./core";
import { ensureImageThumb, storeProjectFiles, type Upload } from "./files";
import * as v from "./validate";

/**
 * Customers (migration 133): who a project is for. One shared record per customer, reused by
 * any number of projects, so nobody registers the same company twice. Anyone who runs projects
 * may register and pick customers; the person who registered one (or the projects lead) edits
 * it. A customer in use is archived instead of deleted.
 *
 * Visibility: staff see the whole register. A student sees only the customers they registered
 * and the customers of projects they own or have joined (accepted teammate); the school's other
 * customers stay hidden from lists, details, logos and the project form alike.
 */

/** The user whose view of customers is limited, or null for the whole register. */
export type CustomerScope = number | null;
export async function customerScope(userId: number, manageAny = false): Promise<CustomerScope> {
  if (manageAny) return null;
  return (await isStudentAccount(userId)) ? userId : null;
}
/** Projects the scoped user is in (owner or accepted teammate). */
const inMyProject = (scope: number, alias = "sp") =>
  sql`(${sql.raw(alias)}.owner_user_id = ${scope} OR EXISTS (SELECT 1 FROM SideProjectMember m WHERE m.project_id = ${sql.raw(alias)}.project_id AND m.user_id = ${scope} AND m.status = 'ACCEPTED'))`;
const visibleTo = (scope: CustomerScope) =>
  scope === null
    ? sql`1 = 1`
    : sql`(c.created_by = ${scope} OR EXISTS (SELECT 1 FROM SideProject sp WHERE sp.customer_id = c.customer_id AND sp.deleted_at IS NULL AND ${inMyProject(scope)}))`;
export async function canSeeCustomer(id: number, scope: CustomerScope) {
  if (scope === null) return true;
  return !!(await one(sql`SELECT 1 AS ok FROM SideProjectCustomer c WHERE c.customer_id = ${id} AND ${visibleTo(scope)}`));
}

export const CUSTOMER_KINDS = ["PERSON", "COMPANY", "SCHOOL", "NGO", "GOVERNMENT", "OTHER"] as const;
const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 120);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function shapeCustomer(r: any) {
  if (!r) return null;
  return {
    id: Number(r.id),
    name: r.name,
    kind: r.kind,
    contactName: r.contactName ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    website: r.website ?? null,
    address: r.address ?? null,
    description: r.description ?? null,
    logoAssetId: r.logoAssetId ? Number(r.logoAssetId) : null,
    projects: r.projects === undefined ? undefined : Number(r.projects),
    createdBy: r.createdBy ? Number(r.createdBy) : null,
    createdByName: r.createdByName ?? null,
    createdAt: r.createdAt ?? null,
    archived: !!r.archivedAt,
  };
}

const cols = (scope: CustomerScope) => sql`
  c.customer_id AS id, c.name, c.kind, c.contact_name AS contactName, c.email, c.phone, c.website, c.address, c.description,
  c.logo_asset_id AS logoAssetId, c.created_by AS createdBy, ${fullName("cp")} AS createdByName, ${iso("c.created_at")} AS createdAt,
  ${iso("c.archived_at")} AS archivedAt,
  (SELECT COUNT(*) FROM SideProject sp WHERE sp.customer_id = c.customer_id AND sp.deleted_at IS NULL
     ${scope === null ? sql`` : sql`AND ${inMyProject(scope)}`}) AS projects`;

export async function listCustomers(q: string, opts: { archived?: boolean; scope?: CustomerScope } = {}) {
  const needle = `%${clip(q, 80)}%`;
  const scope = opts.scope ?? null;
  const r = await many(sql`
    SELECT ${cols(scope)}
    FROM SideProjectCustomer c LEFT JOIN UserProfile cp ON cp.user_id = c.created_by
    WHERE ${opts.archived ? sql`1 = 1` : sql`c.archived_at IS NULL`} AND ${visibleTo(scope)}
      ${q.trim() ? sql`AND (c.name LIKE ${needle} OR c.contact_name LIKE ${needle} OR c.email LIKE ${needle})` : sql``}
    ORDER BY c.name LIMIT 300`);
  return r.map(shapeCustomer);
}

export async function getCustomer(id: number, scope: CustomerScope = null) {
  const r = await one(sql`
    SELECT ${cols(scope)} FROM SideProjectCustomer c LEFT JOIN UserProfile cp ON cp.user_id = c.created_by
    WHERE c.customer_id = ${id} AND ${visibleTo(scope)}`);
  if (!r) fail(404, "NOT_FOUND", "Customer not found");
  return shapeCustomer(r)!;
}

interface CustomerInput {
  name?: unknown;
  kind?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  website?: unknown;
  address?: unknown;
  description?: unknown;
  removeLogo?: unknown;
}

function parse(body: CustomerInput, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || body.name !== undefined) out.name = v.text(body.name, "name", { min: 2, max: 120, required: true, label: "Name" });
  if (!partial || body.kind !== undefined) {
    const k = String(body.kind ?? "COMPANY").toUpperCase();
    if (!(CUSTOMER_KINDS as readonly string[]).includes(k)) fail(400, "VALIDATION", "Choose the kind of customer", "kind");
    out.kind = k;
  }
  if (body.contactName !== undefined) out.contact_name = v.text(body.contactName, "contactName", { max: 120, label: "Contact person" });
  if (body.email !== undefined) {
    const e = clip(body.email, 160);
    if (e && !EMAIL.test(e)) fail(400, "VALIDATION", "Use a valid email address", "email");
    out.email = e || null;
  }
  if (body.phone !== undefined) {
    const ph = clip(body.phone, 40);
    if (ph && !/^[+\d][\d\s().-]{5,}$/.test(ph)) fail(400, "VALIDATION", "Use a valid phone number", "phone");
    out.phone = ph || null;
  }
  if (body.website !== undefined) out.website = clip(body.website, 300) ? v.httpsUrl(body.website, "website") : null;
  if (body.address !== undefined) out.address = v.text(body.address, "address", { max: 300, label: "Address" });
  if (body.description !== undefined) out.description = v.text(body.description, "description", { max: 1000, label: "About" });
  return out;
}

async function storeLogo(by: number, logo: Upload | null | undefined) {
  if (!logo) return null;
  if (/\.svg$/i.test(logo.originalname)) fail(400, "FILE_REFUSED", "Use a PNG, JPG or WebP logo", "logo");
  const [asset] = await storeProjectFiles(null, by, [logo], ["image"]);
  await ensureImageThumb(asset);
  return Number(asset.asset_id);
}

export async function createCustomer(by: number, body: CustomerInput, logo?: Upload | null, scope: CustomerScope = null) {
  const f = parse(body, false);
  const dupe = await one(sql`SELECT customer_id AS id FROM SideProjectCustomer WHERE name_key = ${key(String(f.name))} AND archived_at IS NULL`);
  if (dupe) {
    // One record per customer. A student who can't see the existing one is told who can attach it,
    // without exposing the record itself.
    if (await canSeeCustomer(Number(dupe.id), scope)) fail(409, "DUPLICATE_CUSTOMER", "This customer is already registered: pick it from the list", "name");
    fail(409, "DUPLICATE_CUSTOMER", "This customer is already registered at the school. Ask a staff member on your project team to set it for you", "name");
  }
  const logoId = await storeLogo(by, logo);
  const r = await db.execute(sql`
    INSERT INTO SideProjectCustomer (name, name_key, kind, contact_name, email, phone, website, address, description, logo_asset_id, created_by, created_at, updated_at)
    VALUES (${f.name}, ${key(String(f.name))}, ${f.kind}, ${f.contact_name ?? null}, ${f.email ?? null}, ${f.phone ?? null}, ${f.website ?? null},
            ${f.address ?? null}, ${f.description ?? null}, ${logoId}, ${by}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
  return getCustomer(insertId(r), scope);
}

const assertCanEdit = async (id: number, by: number, manageAny: boolean) => {
  const c = await one(sql`SELECT created_by FROM SideProjectCustomer WHERE customer_id = ${id}`);
  if (!c) fail(404, "NOT_FOUND", "Customer not found");
  if (!manageAny && Number(c.created_by) !== by) fail(403, "NOT_ALLOWED", "Only the person who registered this customer (or the projects lead) can change it");
};

export async function updateCustomer(by: number, manageAny: boolean, id: number, body: CustomerInput, logo?: Upload | null, scope: CustomerScope = null) {
  await assertCanEdit(id, by, manageAny);
  const f = parse(body, true);
  if (f.name) {
    const dupe = await one(sql`SELECT customer_id AS id FROM SideProjectCustomer WHERE name_key = ${key(String(f.name))} AND customer_id <> ${id} AND archived_at IS NULL`);
    if (dupe) fail(409, "DUPLICATE_CUSTOMER", "Another customer already has this name", "name");
  }
  const sets: SQL[] = Object.entries(f).map(([k, val]) => sql`${sql.raw(k)} = ${val as any}`);
  if (f.name) sets.push(sql`name_key = ${key(String(f.name))}`);
  const logoId = await storeLogo(by, logo);
  if (logoId) sets.push(sql`logo_asset_id = ${logoId}`);
  else if (body.removeLogo === true || body.removeLogo === "true") sets.push(sql`logo_asset_id = NULL`);
  if (sets.length) await db.execute(sql`UPDATE SideProjectCustomer SET ${sql.join(sets, sql`, `)}, updated_at = UTC_TIMESTAMP() WHERE customer_id = ${id}`);
  return getCustomer(id, scope);
}

/** Unused customers are deleted; customers some project uses are archived (hidden from pickers). */
export async function removeCustomer(by: number, manageAny: boolean, id: number) {
  await assertCanEdit(id, by, manageAny);
  const used = await one(sql`SELECT COUNT(*) AS n FROM SideProject WHERE customer_id = ${id} AND deleted_at IS NULL`);
  if (Number(used?.n ?? 0) > 0) {
    await db.execute(sql`UPDATE SideProjectCustomer SET archived_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE customer_id = ${id}`);
    return { archived: true };
  }
  await db.execute(sql`DELETE FROM SideProjectCustomer WHERE customer_id = ${id}`);
  return { archived: false };
}

export async function restoreCustomer(by: number, manageAny: boolean, id: number) {
  await assertCanEdit(id, by, manageAny);
  await db.execute(sql`UPDATE SideProjectCustomer SET archived_at = NULL, updated_at = UTC_TIMESTAMP() WHERE customer_id = ${id}`);
}

/**
 * The logo asset of a customer. Staff see any logo; a student sees the logos of customers in
 * their scope and of customers some live project uses (project cards show them on the board).
 */
export async function logoAsset(id: number, scope: CustomerScope = null) {
  const a = await one(sql`
    SELECT fa.* FROM SideProjectCustomer c JOIN FileAsset fa ON fa.asset_id = c.logo_asset_id AND fa.deleted_at IS NULL
    WHERE c.customer_id = ${id}
      ${scope === null ? sql`` : sql`AND (${visibleTo(scope)} OR EXISTS (SELECT 1 FROM SideProject sp WHERE sp.customer_id = c.customer_id AND sp.deleted_at IS NULL))`}`);
  if (!a) fail(404, "NOT_FOUND", "No logo");
  return a;
}

/**
 * Validates a project's "who it's for": OWN, or CUSTOMER with a live customer the actor may see.
 * `keepId` (the project's current customer) is always allowed, so teammates can save other fields.
 */
export async function resolveCustomer(
  modeRaw: unknown,
  idRaw: unknown,
  scope: CustomerScope = null,
  keepId: number | null = null,
): Promise<{ mode: "OWN" | "CUSTOMER"; id: number | null } | undefined> {
  if (modeRaw === undefined && idRaw === undefined) return undefined;
  const mode = String(modeRaw ?? (idRaw ? "CUSTOMER" : "OWN")).toUpperCase();
  if (mode !== "OWN" && mode !== "CUSTOMER") fail(400, "VALIDATION", "Choose own initiative or a customer", "customerMode");
  if (mode === "OWN") return { mode: "OWN", id: null };
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) fail(400, "VALIDATION", "Choose the customer", "customerId");
  const c = await one(sql`SELECT archived_at FROM SideProjectCustomer WHERE customer_id = ${id}`);
  if (!c) fail(400, "VALIDATION", "Choose a registered customer", "customerId");
  if (id !== keepId && !(await canSeeCustomer(id, scope))) fail(400, "VALIDATION", "Choose a registered customer", "customerId");
  if (c.archived_at && id !== keepId) fail(400, "VALIDATION", "This customer is archived", "customerId");
  return { mode: "CUSTOMER", id };
}
