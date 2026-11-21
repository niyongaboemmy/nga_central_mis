import { describe, it, expect } from "vitest";
import { shortClass, shortYear } from "../monitor/ProjectsMonitor";

describe("monitor class column", () => {
  it("shortens a class so it fits on one line", () => {
    expect(shortClass("SPES Year 1 A")).toBe("SPES Y1 A");
    expect(shortClass("Level 3  SOD")).toBe("L3 SOD");
    expect(shortClass("S6 MCB")).toBe("S6 MCB");
  });
  it("shortens the academic year", () => {
    expect(shortYear("2026 - 2027")).toBe("2026/27");
    expect(shortYear("2026/2027")).toBe("2026/27");
    expect(shortYear("Term 1")).toBe("Term 1");
  });
});
