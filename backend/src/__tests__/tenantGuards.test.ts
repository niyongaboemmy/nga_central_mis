/**
 * Guards found missing in the 2026-11 tenant management review: the primary school
 * is never invoiced / downgraded by a payment and never gets support sessions; a
 * PENDING school can't be "reactivated"; archived schools take no overrides or apps;
 * past-dated overrides and bad invoice periods are refused; voiding a change invoice
 * frees the school to ask again; an operator's package change cancels a scheduled one.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { controlPool } from "../db/platform";
import { createInvoice, voidInvoice } from "../services/tenantMgmt/billing";
import { onTenantInvoicePaid } from "../services/tenantMgmt/subscription";
import { addOverride, changeTenantPackage, reactivateTenant, setTenantApp } from "../services/tenantMgmt/lifecycle";
import { grantSession } from "../services/tenantMgmt/support";
import { ensurePlatform, provisionSchool, removeSchool } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
const actor = { userId: 1, ip: null };
const setStatus = (s: string) => controlPool().query("UPDATE Tenant SET status = ? WHERE tenant_id = ?", [s, school.tid]);
const pkgOf = async (tid: number) => String(((await controlPool().query<any[]>("SELECT package_code FROM Tenant WHERE tenant_id = ?", [tid]))[0] as any[])[0].package_code);

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
}, 240_000);

afterAll(async () => {
  await removeSchool(school?.tid, school?.applicationId);
});

describe("primary school", () => {
  it("is never invoiced, and a stray paid invoice leaves its package alone", async () => {
    await expect(createInvoice({ kind: "RENEWAL", tenantId: 1, packageCode: "starter" } as any)).rejects.toMatchObject({ code: "PRIMARY_TENANT" });
    const before = await pkgOf(1);
    const [r]: any = await controlPool().query(
      "INSERT INTO Invoice (kind, tenant_id, package_code, billing_cycle, amount, currency, status, `lines`) VALUES ('RENEWAL', 1, 'starter', 'TERM', 0, 'RWF', 'PAID', '[]')",
    );
    try {
      await onTenantInvoicePaid(Number(r.insertId), null);
      expect(await pkgOf(1)).toBe(before);
    } finally {
      await controlPool().query("DELETE FROM Invoice WHERE invoice_id = ?", [r.insertId]);
    }
  });

  it("doesn't grant support sessions", async () => {
    await expect(grantSession(1, 1, { hours: 1, mode: "READ" })).rejects.toMatchObject({ code: "PRIMARY_TENANT" });
  });
});

describe("invoices", () => {
  it("validates the period", async () => {
    await expect(createInvoice({ kind: "RENEWAL", tenantId: school.tid, packageCode: "gold", periodStart: "next week" } as any)).rejects.toMatchObject({
      code: "INVALID_PERIOD",
    });
    await expect(
      createInvoice({ kind: "RENEWAL", tenantId: school.tid, packageCode: "gold", periodStart: "2027-03-01", periodEnd: "2027-01-01" } as any),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD" });
  });

  it("voiding a change invoice cancels the change", async () => {
    const id = await createInvoice({ kind: "CHANGE", tenantId: school.tid, packageCode: "premium" } as any);
    const [c]: any = await controlPool().query(
      "INSERT INTO SubscriptionChange (tenant_id, from_package, to_package, effective, invoice_id, status) VALUES (?, 'gold', 'premium', 'NOW', ?, 'PENDING')",
      [school.tid, id],
    );
    await voidInvoice(id, "Asked by mistake", null);
    const [[row]]: any = await controlPool().query("SELECT status FROM SubscriptionChange WHERE change_id = ?", [c.insertId]);
    expect(row.status).toBe("CANCELLED");
  });

  it("an operator's package change cancels a scheduled one", async () => {
    const [c]: any = await controlPool().query(
      "INSERT INTO SubscriptionChange (tenant_id, from_package, to_package, effective, status) VALUES (?, 'gold', 'starter', 'NEXT_PERIOD', 'SCHEDULED')",
      [school.tid],
    );
    await changeTenantPackage(school.tid, "premium", "Agreed with the head", actor);
    const [[row]]: any = await controlPool().query("SELECT status FROM SubscriptionChange WHERE change_id = ?", [c.insertId]);
    expect(row.status).toBe("CANCELLED");
    await changeTenantPackage(school.tid, "gold", "Back to gold", actor);
  });
});

describe("lifecycle", () => {
  it("won't reactivate a school that is still being set up", async () => {
    await setStatus("PENDING");
    try {
      await expect(reactivateTenant(school.tid, "Go live", actor)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    } finally {
      await setStatus("ACTIVE");
    }
  });

  it("refuses past-dated overrides, and overrides or apps for an archived school", async () => {
    await expect(addOverride(school.tid, { key: "limit.students", value: 500, reason: "Pilot", expiresAt: "2020-01-01" }, actor)).rejects.toThrow(/future/);
    await setStatus("ARCHIVED");
    try {
      await expect(addOverride(school.tid, { key: "limit.students", value: 500, reason: "Pilot" }, actor)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
      await expect(setTenantApp(school.tid, 1, "ACTIVE", actor)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    } finally {
      await setStatus("ACTIVE");
    }
  });
});
