import { describe, it, expect } from "vitest";
import { getSchoolLogoUrl } from "../schools";

describe("getSchoolLogoUrl (fallback when the server sends no logo_urls)", () => {
  it("names the school for any school but the first", () => {
    expect(getSchoolLogoUrl(2, "primary", 99, "lake")).toMatch(/\/schools\/2\/logo\/primary\?tenant=lake&v=99$/);
    expect(getSchoolLogoUrl(2, "documents", null, 2)).toMatch(/\/schools\/2\/logo\/documents\?tenant=2$/);
  });

  it("keeps the first school's address unchanged", () => {
    expect(getSchoolLogoUrl(1, "primary", 99)).toMatch(/\/schools\/1\/logo\/primary\?v=99$/);
    expect(getSchoolLogoUrl(1, "primary", 99, 1)).toMatch(/\/schools\/1\/logo\/primary\?v=99$/);
    expect(getSchoolLogoUrl(1, "partner")).toMatch(/\/schools\/1\/logo\/partner$/);
  });
});
