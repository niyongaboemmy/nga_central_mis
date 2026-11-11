/**
 * Package catalogue admin (plan §3, M4): list, edit, replace entitlements.
 * Shapes = frontend/src/api/tenantMgmt.ts `PackageInfo` / `Entitlement`.
 * Every change calls onEntitlementsChanged() (all tenants) so it takes effect at once.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { NotFoundError, ValidationError } from "../../errors/CustomError";
import { platformAudit } from "../../tenancy/audit";
import { APP_KEYS, EntKind, FEATURES, LIMITS, kindOfKey } from "./catalog";
import { onEntitlementsChanged } from "./entitlementsChanged";
import { inControlTx } from "./applicationStore";
import { coded } from "./billing";

export function labelOf(key: string): string {
  if (key in APP_KEYS) return APP_KEYS[key].label;
  if (key in FEATURES) return FEATURES[key];
  if (key in LIMITS) return `${LIMITS[key].label}${LIMITS[key].unit ? ` (${LIMITS[key].unit.replace(/^\//, "per ")})` : ""}`;
  return key;
}

/** Every known APP / FEATURE / LIMIT key with its label (package editor rows). */
export function entitlementCatalog() {
  const row = (key: string, kind: EntKind) => ({ key, kind, value: null as number | null, label: labelOf(key) });
  return [
    ...Object.keys(APP_KEYS).map((k) => row(k, "APP")),
    ...Object.keys(FEATURES).map((k) => row(k, "FEATURE")),
    ...Object.keys(LIMITS).map((k) => row(k, "LIMIT")),
  ];
}

function serializePackage(p: RowDataPacket, ents: RowDataPacket[]) {
  return {
    code: String(p.code),
    name: String(p.name),
    tier: Number(p.tier),
    tagline: p.tagline ?? null,
    description: p.description ?? null,
    accent: p.accent ?? null,
    isPublic: Number(p.is_public) === 1,
    isActive: Number(p.is_active) === 1,
    priceTerm: p.price_term_rwf === null ? null : Number(p.price_term_rwf),
    priceYear: p.price_year_rwf === null ? null : Number(p.price_year_rwf),
    currency: String(p.currency ?? "RWF"),
    entitlements: ents
      .filter((e) => String(e.package_code) === String(p.code))
      .map((e) => ({
        key: String(e.ent_key),
        kind: e.kind as EntKind,
        value: e.value_int === null ? null : Number(e.value_int),
        label: labelOf(String(e.ent_key)),
      })),
  };
}
export type SerializedPackage = ReturnType<typeof serializePackage>;

export async function listPackages(): Promise<SerializedPackage[]> {
  const [pkgs] = await controlPool().query<RowDataPacket[]>("SELECT * FROM Package ORDER BY tier, code");
  const [ents] = await controlPool().query<RowDataPacket[]>("SELECT * FROM PackageEntitlement ORDER BY kind, ent_key");
  return pkgs.map((p) => serializePackage(p, ents));
}

export async function getPackage(code: string): Promise<SerializedPackage> {
  const [pkgs] = await controlPool().query<RowDataPacket[]>("SELECT * FROM Package WHERE code = ?", [code]);
  if (!pkgs[0]) throw new NotFoundError("Package not found");
  const [ents] = await controlPool().query<RowDataPacket[]>("SELECT * FROM PackageEntitlement WHERE package_code = ? ORDER BY kind, ent_key", [code]);
  return serializePackage(pkgs[0], ents);
}

/** A Package / PackageEntitlement edit: every school's entitlements, snapshots and TenantSystem rows. */
const changed = () => onEntitlementsChanged();

const price = (v: unknown, what: string): number | null => {
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw coded(new ValidationError(`${what} must be a whole number ≥ 0.`), "INVALID_PRICE");
  return n;
};

export async function updatePackage(
  code: string,
  body: Partial<{ name: string; tagline: string | null; description: string | null; accent: string | null; isPublic: boolean; isActive: boolean; priceTerm: number | null; priceYear: number | null }>,
  actorId: number | null,
): Promise<SerializedPackage> {
  await getPackage(code);
  const set: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) throw coded(new ValidationError("A name is required."), "INVALID_NAME");
    set.name = name.slice(0, 60);
  }
  if (body.tagline !== undefined) set.tagline = body.tagline === null ? null : String(body.tagline).slice(0, 160);
  if (body.description !== undefined) set.description = body.description === null ? null : String(body.description);
  if (body.accent !== undefined) set.accent = body.accent === null ? null : String(body.accent).slice(0, 20);
  if (body.isPublic !== undefined) set.is_public = body.isPublic ? 1 : 0;
  if (body.isActive !== undefined) set.is_active = body.isActive ? 1 : 0;
  if (body.priceTerm !== undefined) set.price_term_rwf = price(body.priceTerm, "The term price");
  if (body.priceYear !== undefined) set.price_year_rwf = price(body.priceYear, "The year price");
  const keys = Object.keys(set);
  if (keys.length) {
    set.updated_by = actorId;
    const all = Object.keys(set);
    await controlPool().query(`UPDATE Package SET ${all.map((k) => `\`${k}\` = ?`).join(", ")} WHERE code = ?`, [...all.map((k) => set[k]), code]);
    void platformAudit({ action: "package.update", actorUserId: actorId, payload: { code, fields: keys } });
    await changed();
  }
  return getPackage(code);
}

/** Full replace of a package's entitlements (keys from the catalog; LIMIT value int ≥ 0 or null = unlimited). */
export async function replaceEntitlements(code: string, list: unknown, actorId: number | null): Promise<SerializedPackage> {
  await getPackage(code);
  if (!Array.isArray(list)) throw coded(new ValidationError("entitlements must be a list."), "INVALID_ENTITLEMENTS");
  const seen = new Set<string>();
  const rows = list.map((e: any) => {
    const key = String(e?.key ?? "");
    const kind = kindOfKey(key);
    if (!kind) throw coded(new ValidationError(`Unknown entitlement: ${key}`), "UNKNOWN_ENTITLEMENT");
    if (seen.has(key)) throw coded(new ValidationError(`Listed twice: ${key}`), "INVALID_ENTITLEMENTS");
    seen.add(key);
    let value: number | null = null;
    if (kind === "LIMIT" && e?.value !== null && e?.value !== undefined) {
      value = Number(e.value);
      if (!Number.isInteger(value) || value < 0) throw coded(new ValidationError(`${labelOf(key)}: a whole number ≥ 0, or empty for unlimited.`), "INVALID_LIMIT");
    }
    return [code, key, kind, value];
  });
  await inControlTx(async (conn) => {
    await conn.query("DELETE FROM PackageEntitlement WHERE package_code = ?", [code]);
    if (rows.length) await conn.query("INSERT INTO PackageEntitlement (package_code, ent_key, kind, value_int) VALUES ?", [rows]);
    await conn.query("UPDATE Package SET updated_by = ? WHERE code = ?", [actorId, code]);
  });
  void platformAudit({ action: "package.entitlements", actorUserId: actorId, payload: { code, entitlements: rows.map((r) => ({ key: r[1], value: r[3] })) } });
  await changed();
  return getPackage(code);
}
