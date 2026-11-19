// Connect with a link (migration 141): what people paste, and the task suggestion. No database.
import { describe, it, expect } from "vitest";
import { parseRepo } from "../services/sideProjects/git/linkMode";
import { bestTask } from "../services/sideProjects/git/drafts";

describe("reading what people paste", () => {
  it("takes the page, the clone URL, SSH and owner/repo", () => {
    for (const u of ["https://github.com/aimee/orders-public", "github.com/aimee/orders-public.git", "git@github.com:aimee/orders-public.git", "aimee/orders-public", "https://github.com/aimee/orders-public/tree/main/src"]) {
      expect(parseRepo(u), u).toEqual({ owner: "aimee", repo: "orders-public" });
    }
    expect(parseRepo("https://gitlab.com/x")).toBeNull();
    expect(parseRepo("")).toBeNull();
  });
  it("suggests the task whose words match the work", () => {
    const list = [{ id: 1, title: "Build the shop order form" }, { id: 2, title: "Farmer's daily orders list" }, { id: 3, title: "Mobile money payments" }];
    expect(bestTask("daily-list Show tomorrow's daily orders", list)).toBe(2);
    expect(bestTask("feat/momo Payments with mobile money", list)).toBe(3);
    expect(bestTask("chore: bump deps", list)).toBeNull();
  });
});

