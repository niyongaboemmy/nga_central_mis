import { createHash } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  AccessAudit,
  AccessManifestRow,
  AccessPermission,
  AccessPresetLink,
  AccessRole,
  AccessRolePermission,
  AccessRule,
  AccessGrant,
  UserAccessVersion,
} from "../../db/accessSchema";
import { UserRole } from "../../db/schema";
import {
  Depth,
  isRestricted,
  Manifest,
  validateManifest,
} from "../../vendor/nga-access";
import { MIS_MANIFEST } from "../../access/manifest";
import { DEFAULT_RULES, PRESETS, PresetCap } from "../../access/presets";
import logger from "../../utils/logger";

import { isV2OnlyCapability } from "../../access/v2Only";
export { V2_ONLY_CAPABILITIES, isV2OnlyCapability } from "../../access/v2Only";

/** Registry name of a capability: MIS keeps bare names, others are "app:KEY". */
export const capabilityName = (app: string, key: string) =>
  app === "mis" ? key : `${app}:${key}`;

const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

export async function writeAudit(entry: {
  actorId?: number | null;
  subjectUserId?: number | null;
  action: string;
  target?: unknown;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}) {
  await db.insert(AccessAudit).values({
    actor_id: entry.actorId ?? null,
    subject_user_id: entry.subjectUserId ?? null,
    action: entry.action,
    target: entry.target === undefined ? null : JSON.stringify(entry.target),
    before_json: entry.before === undefined ? null : JSON.stringify(entry.before),
    after_json: entry.after === undefined ? null : JSON.stringify(entry.after),
    reason: entry.reason ?? null,
  });
}

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------

export interface ManifestSyncResult {
  app: string;
  checksum: string;
  unchanged: boolean;
  created: string[];
  updated: string[];
  deprecated: string[];
  revived: string[];
}

export class ManifestValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Invalid manifest: ${errors.join("; ")}`);
  }
}

/**
 * Upsert an app's capabilities into the registry (Permission rows).
 * Never deletes: capabilities dropped from a manifest are marked deprecated
 * so Access Studio can flag roles still using them.
 */
export async function syncManifest(
  manifest: Manifest,
  actorId: number | null = null,
): Promise<ManifestSyncResult> {
  const errors = validateManifest(manifest);
  if (errors.length > 0) throw new ManifestValidationError(errors);

  const checksum = createHash("sha256").update(canonicalJson(manifest)).digest("hex");
  const result: ManifestSyncResult = {
    app: manifest.app,
    checksum,
    unchanged: false,
    created: [],
    updated: [],
    deprecated: [],
    revived: [],
  };

  const [previous] = await db
    .select({ checksum: AccessManifestRow.checksum })
    .from(AccessManifestRow)
    .where(eq(AccessManifestRow.app, manifest.app))
    .limit(1);
  if (previous?.checksum === checksum) {
    result.unchanged = true;
    return result;
  }

  const existing = await db
    .select()
    .from(AccessPermission)
    .where(eq(AccessPermission.app, manifest.app));
  const byKey = new Map(existing.map((p) => [p.cap_key ?? p.name, p]));

  for (const [key, def] of Object.entries(manifest.capabilities)) {
    const name = capabilityName(manifest.app, key);
    const meta = {
      label: def.label,
      domain: def.domain,
      kind: def.kind,
      depths: def.kind === "READ" ? (def.depths ?? []).join(",") : null,
      restricted: def.restricted ? 1 : 0,
      scopeable: def.scopeable === false ? 0 : 1,
    };
    const row = byKey.get(key);
    if (!row) {
      await db.insert(AccessPermission).values({
        name,
        description: def.description ?? def.label,
        status: "ACTIVE",
        app: manifest.app,
        cap_key: key,
        ...meta,
      });
      result.created.push(name);
      continue;
    }
    const changed =
      row.label !== meta.label ||
      row.domain !== meta.domain ||
      row.kind !== meta.kind ||
      (row.depths ?? null) !== meta.depths ||
      row.restricted !== meta.restricted ||
      row.scopeable !== meta.scopeable ||
      row.deprecated_at !== null;
    if (changed) {
      await db
        .update(AccessPermission)
        .set({ ...meta, cap_key: key, deprecated_at: null })
        .where(eq(AccessPermission.perm_id, row.perm_id));
      if (row.deprecated_at !== null) result.revived.push(name);
      else result.updated.push(name);
    }
  }

  for (const row of existing) {
    const key = row.cap_key ?? row.name;
    if (!manifest.capabilities[key] && row.deprecated_at === null) {
      await db
        .update(AccessPermission)
        .set({ deprecated_at: new Date() })
        .where(eq(AccessPermission.perm_id, row.perm_id));
      result.deprecated.push(row.name);
    }
  }

  const body = JSON.stringify(manifest);
  if (previous) {
    await db
      .update(AccessManifestRow)
      .set({ version: manifest.version ?? null, checksum, manifest: body, published_at: new Date() })
      .where(eq(AccessManifestRow.app, manifest.app));
  } else {
    await db.insert(AccessManifestRow).values({
      app: manifest.app,
      version: manifest.version ?? null,
      checksum,
      manifest: body,
    });
  }

  await writeAudit({
    actorId,
    action: "manifest.publish",
    target: { app: manifest.app, version: manifest.version ?? null },
    after: {
      created: result.created,
      updated: result.updated,
      deprecated: result.deprecated,
      revived: result.revived,
    },
  });
  manifestCache.delete(manifest.app);
  return result;
}

const manifestCache = new Map<string, Manifest | null>();

/** Latest published manifest of an app (MIS falls back to the code copy). */
export async function getManifest(app: string): Promise<Manifest | null> {
  if (app === "mis") return MIS_MANIFEST;
  if (manifestCache.has(app)) return manifestCache.get(app) ?? null;
  const [row] = await db
    .select({ manifest: AccessManifestRow.manifest })
    .from(AccessManifestRow)
    .where(eq(AccessManifestRow.app, app))
    .limit(1);
  const parsed = row ? (JSON.parse(row.manifest) as Manifest) : null;
  manifestCache.set(app, parsed);
  return parsed;
}

/** Is granting `name` at `depth` restricted (needs justification + expiry)? */
export async function isRestrictedGrant(name: string, depth: Depth | null) {
  const [app, key] = name.includes(":") ? name.split(":") : ["mis", name];
  const def = (await getManifest(app))?.capabilities?.[key];
  return def ? isRestricted(def, depth) : false;
}

// ---------------------------------------------------------------------------
// Roles & presets
// ---------------------------------------------------------------------------

/**
 * The legacy Role table has no AUTO_INCREMENT (nor a primary key) in the
 * deployed schema, so ids are allocated here under a named lock.
 */
export async function insertRoleWithNextId(values: {
  name: string;
  description?: string | null;
  preset_key?: string | null;
  category?: string | null;
  allowed_scope_types?: string | null;
  max_holders?: number | null;
  platform_only?: number;
  is_preset?: number;
}): Promise<number> {
  const conn = (db as any).session.client;
  const lock = await conn.getConnection();
  try {
    await lock.query("SELECT GET_LOCK('access_role_id', 10)");
    const [[row]] = await lock.query(
      "SELECT COALESCE(MAX(role_id), 0) + 1 AS id FROM `Role`",
    );
    const roleId = Number(row.id);
    await lock.query(
      "INSERT INTO `Role` (role_id, name, description, status, preset_key, category, allowed_scope_types, max_holders, platform_only, is_preset, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, NOW())",
      [
        roleId,
        values.name,
        values.description ?? null,
        values.preset_key ?? null,
        values.category ?? null,
        values.allowed_scope_types ?? null,
        values.max_holders ?? null,
        values.platform_only ?? 0,
        values.is_preset ?? 0,
      ],
    );
    return roleId;
  } finally {
    await lock.query("SELECT RELEASE_LOCK('access_role_id')").catch(() => undefined);
    lock.release();
  }
}

export interface PresetApplyResult {
  rolesCreated: string[];
  rolesMapped: string[];
  linksAdded: Array<{ preset: string; capability: string }>;
  linksDeferred: Array<{ preset: string; capability: string }>;
  linksWithheld: Array<{ preset: string; capability: string; reason: string }>;
}

const capName = (c: PresetCap) => (Array.isArray(c) ? c[0] : c);
const capDepth = (c: PresetCap): Depth | null => (Array.isArray(c) ? c[1] : null);

/** Insert-only preset seeding; safe to run on every boot. */
export async function ensurePresets(): Promise<PresetApplyResult> {
  const out: PresetApplyResult = {
    rolesCreated: [],
    rolesMapped: [],
    linksAdded: [],
    linksDeferred: [],
    linksWithheld: [],
  };

  const perms = await db
    .select({
      perm_id: AccessPermission.perm_id,
      name: AccessPermission.name,
      kind: AccessPermission.kind,
      depths: AccessPermission.depths,
    })
    .from(AccessPermission)
    .where(eq(AccessPermission.status, "ACTIVE"));
  const permByName = new Map(perms.map((p) => [p.name, p]));

  const rolesChanged = new Set<number>();
  const applied = await db.select().from(AccessPresetLink);
  const appliedSet = new Set(applied.map((a) => `${a.preset_key}|${a.perm_name}`));

  for (const preset of PRESETS) {
    // 1) Find or create the role.
    let [role] = await db
      .select()
      .from(AccessRole)
      .where(eq(AccessRole.preset_key, preset.key))
      .limit(1);

    if (!role && preset.existingName) {
      [role] = await db
        .select()
        .from(AccessRole)
        .where(eq(AccessRole.name, preset.existingName))
        .limit(1);
      if (role) {
        await db
          .update(AccessRole)
          .set({
            preset_key: preset.key,
            is_preset: 1,
            category: role.category ?? preset.category,
            allowed_scope_types: role.allowed_scope_types ?? preset.scopes.join(","),
            max_holders: role.max_holders ?? preset.maxHolders ?? null,
            platform_only: preset.platformOnly ? 1 : role.platform_only,
            updated_at: new Date(),
          })
          .where(eq(AccessRole.role_id, role.role_id));
        out.rolesMapped.push(`${preset.existingName} -> ${preset.key}`);
      }
    }

    if (!role) {
      // A preset mapped onto a legacy role is created under the legacy name:
      // code still keys off SUPER_ADMIN / TEACHER / CLASS_TEACHER literally.
      const roleId = await insertRoleWithNextId({
        name: preset.existingName ?? preset.name,
        description: preset.description,
        preset_key: preset.key,
        category: preset.category,
        allowed_scope_types: preset.scopes.join(","),
        max_holders: preset.maxHolders ?? null,
        platform_only: preset.platformOnly ? 1 : 0,
        is_preset: 1,
      });
      [role] = await db
        .select()
        .from(AccessRole)
        .where(eq(AccessRole.role_id, roleId))
        .limit(1);
      out.rolesCreated.push(preset.existingName ?? preset.name);
    }

    // 2) Who holds it today? Held roles only gain v2-only capabilities.
    const [holders] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(UserRole)
      .where(eq(UserRole.role_id, role.role_id));
    const held = Number(holders?.n ?? 0) > 0;

    // 3) Apply each preset link at most once.
    for (const cap of preset.caps) {
      const name = capName(cap);
      if (appliedSet.has(`${preset.key}|${name}`)) continue;
      const perm = permByName.get(name);
      if (!perm) {
        out.linksDeferred.push({ preset: preset.key, capability: name });
        continue;
      }
      if (held && !isV2OnlyCapability(name)) {
        out.linksWithheld.push({
          preset: preset.key,
          capability: name,
          reason: "role has holders; legacy permission left unchanged",
        });
        continue;
      }
      const depth =
        perm.kind === "READ"
          ? capDepth(cap) ?? ((perm.depths ?? "").split(",").includes("detail") ? "detail" : (perm.depths ?? "").split(",")[0] || null)
          : null;

      const [existingLink] = await db
        .select()
        .from(AccessRolePermission)
        .where(
          and(
            eq(AccessRolePermission.role_id, role.role_id),
            eq(AccessRolePermission.perm_id, perm.perm_id),
          ),
        )
        .limit(1);
      if (!existingLink) {
        await db.insert(AccessRolePermission).values({
          role_id: role.role_id,
          perm_id: perm.perm_id,
          depth: depth as Depth | null,
        });
        out.linksAdded.push({ preset: preset.key, capability: name });
        rolesChanged.add(role.role_id);
      }
      await db
        .insert(AccessPresetLink)
        .values({ preset_key: preset.key, perm_name: name })
        .onDuplicateKeyUpdate({ set: { perm_name: name } });
      appliedSet.add(`${preset.key}|${name}`);
    }
  }
  // Holders of a role that just gained capabilities must refresh their
  // snapshots (apps cache them by access_version).
  if (rolesChanged.size > 0) {
    const ids = [...rolesChanged];
    const holders = [
      ...(await db
        .selectDistinct({ user_id: AccessGrant.user_id })
        .from(AccessGrant)
        .where(and(inArray(AccessGrant.role_id, ids), inArray(AccessGrant.status, ["ACTIVE", "SUSPENDED"])))),
      ...(await db.selectDistinct({ user_id: UserRole.user_id }).from(UserRole).where(inArray(UserRole.role_id, ids))),
    ].map((h) => h.user_id);
    const unique = Array.from(new Set(holders));
    for (let i = 0; i < unique.length; i += 500) {
      await db
        .update(UserAccessVersion)
        .set({ access_version: sql`${UserAccessVersion.access_version} + 1` })
        .where(inArray(UserAccessVersion.user_id, unique.slice(i, i + 500)));
    }
  }
  return out;
}

/** Insert-only default rules (never overwrites an edited rule). */
export async function ensureDefaultRules(): Promise<string[]> {
  const created: string[] = [];
  const existing = await db.select({ rule_key: AccessRule.rule_key }).from(AccessRule);
  const have = new Set(existing.map((r) => r.rule_key));
  const roles = await db
    .select({ role_id: AccessRole.role_id, preset_key: AccessRole.preset_key })
    .from(AccessRole)
    .where(
      inArray(
        AccessRole.preset_key,
        DEFAULT_RULES.map((r) => r.preset),
      ),
    );
  const roleByPreset = new Map(roles.map((r) => [r.preset_key, r.role_id]));

  for (const rule of DEFAULT_RULES) {
    if (have.has(rule.key)) continue;
    const roleId = roleByPreset.get(rule.preset);
    if (!roleId) continue;
    await db.insert(AccessRule).values({
      rule_key: rule.key,
      name: rule.name,
      trigger_type: rule.trigger,
      trigger_filter: rule.filter ? JSON.stringify(rule.filter) : null,
      role_id: roleId,
      status: "ACTIVE",
    });
    created.push(rule.key);
  }
  return created;
}

/** Tables from migration 090 present? (The engine stays off until they are.) */
export async function accessTablesPresent(): Promise<boolean> {
  const rows = (await db.execute(
    sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('AccessGrant','AccessRule','AccessManifest','AccessPresetLink','AccessAudit')`,
  )) as any;
  return Number(rows[0][0].n) === 5;
}

/**
 * Register the MIS manifest, presets and default rules, and say what changed.
 * Throws on failure -- the CLI uses this so a broken bootstrap fails the run
 * instead of printing success.
 */
export async function runAccessBootstrap() {
  const manifest = await syncManifest(MIS_MANIFEST);
  const presets = await ensurePresets();
  const rules = await ensureDefaultRules();
  return {
    manifestUnchanged: manifest.unchanged,
    capabilitiesCreated: manifest.created.length,
    rolesCreated: presets.rolesCreated,
    rolesMapped: presets.rolesMapped,
    linksAdded: presets.linksAdded,
    linksWithheld: presets.linksWithheld.length,
    linksDeferred: presets.linksDeferred,
    rulesCreated: rules,
  };
}

/**
 * Boot-time bootstrap: register the MIS manifest, seed presets and default
 * rules, then heal legacy admin grants. Insert-only and idempotent; logs and
 * carries on if anything fails so the MIS never refuses to start because of
 * the access engine.
 */
export async function ensureAccessRegistry(): Promise<void> {
  if (process.env.ACCESS_V2_BOOTSTRAP === "false") return;
  try {
    if (!(await accessTablesPresent())) {
      logger.warn("[access] migration 090 not applied -- access engine bootstrap skipped");
      return;
    }
    const report = await runAccessBootstrap();
    const { ensureLegacyAdminGrants } = await import("./backfill");
    const healed = await ensureLegacyAdminGrants();
    logger.info("[access] registry ready", {
      ...report,
      linksAdded: report.linksAdded.length,
      linksDeferred: report.linksDeferred.length,
      grantsHealed: healed.length,
    });
  } catch (err: any) {
    logger.error(`[access] bootstrap failed: ${err?.message ?? err}`);
  }
}
