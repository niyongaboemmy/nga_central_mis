/**
 * A school's logo, set from the platform console (POST/DELETE /platform/tenants/:id/logo).
 *
 * Same storage and rules as the school's own upload (POST /schools/:id/logo): the bytes are
 * sniffed (unsafe SVGs refused), the file lands in that school's tenant storage, and School
 * .updated_at moves so every ?v= logo URL changes at once. The work runs inside the school's
 * tenant context, so `db` and the file server both point at that school.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { School } from "../../db/schema";
import { NotFoundError, ValidationError } from "../../errors/CustomError";
import storageService from "../../utils/fileServer";
import { sniffImage } from "../../controllers/schoolController";
import { runWithTenant } from "../../vendor/nga-tenancy";
import { getTenant } from "../../tenancy/registry";
import { platformAudit } from "../../tenancy/audit";
import { publishTenantChanged } from "./subscription";
import { TenantActionError, tenantRow, type PlatformActorInfo } from "./lifecycle";

async function schoolContext(tid: number) {
  const row = await tenantRow(tid);
  if (String(row.status) === "ARCHIVED") throw new TenantActionError(409, "INVALID_TRANSITION", "An archived school can't be edited.");
  if (!row.mis_db_name && Number(row.tenant_id) !== 1) throw new TenantActionError(409, "NOT_PROVISIONED", "This school isn't set up yet.");
  const tenant = await getTenant(tid);
  if (!tenant) throw new NotFoundError("School not found");
  return tenant;
}

const firstActiveSchool = async () => {
  const [school] = await db.select().from(School).where(eq(School.status, "ACTIVE")).orderBy(asc(School.school_id)).limit(1);
  if (!school) throw new NotFoundError("The school has no active record yet");
  return school;
};

export async function setTenantLogo(tid: number, file: { buffer?: Buffer } | undefined, actor: PlatformActorInfo) {
  if (!file?.buffer?.length) throw new ValidationError("Choose an image to upload");
  const kind = sniffImage(file.buffer);
  if ("error" in kind) throw new ValidationError(kind.error);
  const tenant = await schoolContext(tid);
  const path = await runWithTenant(tenant, async () => {
    const school = await firstActiveSchool();
    const remotePath = `schools/${school.school_id}/logo-primary-${Date.now()}${kind.ext}`;
    await storageService.uploadFile(file.buffer!, remotePath);
    await db.update(School).set({ logo: remotePath, updated_at: new Date() } as any).where(eq(School.school_id, school.school_id));
    return remotePath;
  });
  await publishTenantChanged(tid);
  await platformAudit({ action: "tenant.logo", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { path } });
}

export async function clearTenantLogo(tid: number, actor: PlatformActorInfo) {
  const tenant = await schoolContext(tid);
  await runWithTenant(tenant, async () => {
    const school = await firstActiveSchool();
    await db.update(School).set({ logo: null, updated_at: new Date() } as any).where(eq(School.school_id, school.school_id));
  });
  await publishTenantChanged(tid);
  await platformAudit({ action: "tenant.logo.remove", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: {} });
}
