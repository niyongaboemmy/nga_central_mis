/**
 * The public logo address must name the school. GET /schools/:id/logo/:slot
 * carries no sign-in and School ids repeat across school databases, so an address
 * without ?tenant= is served from the primary school's records: another school's
 * uploaded logo came back as "not found" and its pages showed initials.
 */
import { describe, expect, it } from "vitest";
import { runWithTenant, TenantCtx } from "../vendor/nga-tenancy";
import { schoolLogoUrl, withLogoState } from "../controllers/schoolController";

const tenant = (tid: number, slug: string): TenantCtx =>
  ({ tid, slug, name: slug, status: "ACTIVE", isPrimary: tid === 1, timezone: "Africa/Kigali", pkg: "max" }) as TenantCtx;

describe("schoolLogoUrl", () => {
  it("names any school but the primary, and carries the version", () => {
    expect(schoolLogoUrl("https://api.example", 2, "primary", { tid: 2, slug: "lake" }, 1700)).toBe(
      "https://api.example/schools/2/logo/primary?tenant=lake&v=1700",
    );
    expect(schoolLogoUrl("https://api.example/", 2, "documents", { tid: 2, slug: "lake" })).toBe(
      "https://api.example/schools/2/logo/documents?tenant=lake",
    );
  });

  it("keeps the primary school's address as it always was", () => {
    expect(schoolLogoUrl("https://api.example", 1, "primary", { tid: 1, slug: "nga" }, 1700)).toBe("https://api.example/schools/1/logo/primary?v=1700");
    expect(schoolLogoUrl("https://api.example", 1, "partner", null)).toBe("https://api.example/schools/1/logo/partner");
  });
});

describe("a School row as the API returns it", () => {
  const row = { school_id: 2, name: "Lake", logo: "nga_central_mis/t/2/schools/2/logo-primary-1.png", partner_logo: null, documents_logo: "uploaded", updated_at: new Date(1_700_000_000_000) };

  it("carries ready addresses that name the school the request runs in", async () => {
    const out = await runWithTenant(tenant(2, "lake"), async () => withLogoState(row));
    expect(out.logo_version).toBe(1_700_000_000_000);
    expect(out.logo_urls.primary).toMatch(/\/schools\/2\/logo\/primary\?tenant=lake&v=1700000000000$/);
    // Not set, or a value that cannot be served: no address.
    expect(out.logo_urls.partner).toBeNull();
    expect(out.logo_urls.documents).toBeNull();
    expect(out.documents_logo).toBeNull();
  });

  it("leaves the primary school's addresses without a school name", async () => {
    const out = await runWithTenant(tenant(1, "nga"), async () => withLogoState({ ...row, school_id: 1 }));
    expect(out.logo_urls.primary).toMatch(/\/schools\/1\/logo\/primary\?v=1700000000000$/);
  });
});
