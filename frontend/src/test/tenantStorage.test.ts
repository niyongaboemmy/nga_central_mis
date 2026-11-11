import { describe, it, expect, beforeEach } from "vitest";
import {
  clearIdentityCaches,
  currentUserCacheKey,
  forgetIdentity,
  noteIdentity,
  readIdentity,
  tenantStorageKey,
} from "../lib/tenant";

/** Browser storage is keyed by school + person, and a switch drops the old one's data. */
describe("tenant-keyed browser storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keys a person's data by tid and user id", async () => {
    expect(tenantStorageKey("nga.user.offlineCache", 2, 7)).toBe("nga.user.offlineCache.t2.u7");
    expect(currentUserCacheKey()).toBeNull();
    await noteIdentity(2, 7);
    expect(readIdentity()).toEqual({ tid: 2, userId: 7 });
    expect(currentUserCacheKey()).toBe("nga.user.offlineCache.t2.u7");
  });

  it("clears the previous identity's data when the school or person changes", async () => {
    await noteIdentity(1, 7);
    localStorage.setItem("nga.user.offlineCache.t1.u7", "{}");
    localStorage.setItem("academic_period_year_id", "12");
    localStorage.setItem("mentorship_draft_44", "draft");
    localStorage.setItem("theme", "dark"); // a UI preference: kept
    localStorage.setItem("token", "keep-me"); // the new session: kept
    sessionStorage.setItem("x", "1");

    // Same identity again: nothing is cleared.
    expect(await noteIdentity(1, 7)).toBe(false);
    expect(localStorage.getItem("academic_period_year_id")).toBe("12");

    // Same user id, another school: everything personal goes.
    expect(await noteIdentity(2, 7)).toBe(true);
    expect(localStorage.getItem("nga.user.offlineCache.t1.u7")).toBeNull();
    expect(localStorage.getItem("academic_period_year_id")).toBeNull();
    expect(localStorage.getItem("mentorship_draft_44")).toBeNull();
    expect(sessionStorage.getItem("x")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(localStorage.getItem("token")).toBe("keep-me");
    expect(readIdentity()).toEqual({ tid: 2, userId: 7 });
  });

  it("forgets the identity on sign-out", async () => {
    await noteIdentity(2, 7);
    localStorage.setItem("nga.user.offlineCache.t2.u7", "{}");
    await forgetIdentity();
    expect(readIdentity()).toBeNull();
    expect(localStorage.getItem("nga.user.offlineCache.t2.u7")).toBeNull();
    await clearIdentityCaches(); // idempotent
  });
});
