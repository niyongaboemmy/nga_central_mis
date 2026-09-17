import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// The hook reads only from the /users/me payload, so the context is the only
// thing worth mocking.
let mockUser: any = null;
vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: mockUser }),
}));

import { useScopedGrades } from "../useScopedGrades";

const ALL_GRADES = [
  { grade_id: 24, name: "Year 2", level_order: 1, program_id: 8, program_name: "Coding Academy" },
  { grade_id: 25, name: "Year 1", level_order: 2, program_id: 8, program_name: "Coding Academy" },
  { grade_id: 15, name: "Grade 5", level_order: 8, program_id: 6, program_name: "Primary Program" },
];

describe("useScopedGrades", () => {
  it("treats an admin with neither assignment as unscoped, not as scoped-to-nothing", () => {
    mockUser = {
      assignedGrades: [],
      assignedPrograms: [],
      allGrades: ALL_GRADES,
    };
    const { result } = renderHook(() => useScopedGrades());

    expect(result.current.isScoped).toBe(false);
    expect(result.current.source).toBe("none");
    expect(result.current.gradeIds).toEqual([]);
    expect(result.current.defaultClassGroupId).toBeNull();
  });

  it("scopes a class teacher to their assigned grades and class groups", () => {
    mockUser = {
      assignedGrades: [
        {
          grade_id: 24,
          name: "Year 2",
          program_id: 8,
          program_name: "Coding Academy",
          class_group_id: 101,
          class_group_name: "Year 2 A",
        },
        {
          grade_id: 24,
          name: "Year 2",
          program_id: 8,
          program_name: "Coding Academy",
          class_group_id: 102,
          class_group_name: "Year 2 B",
        },
      ],
      assignedPrograms: [],
      allGrades: ALL_GRADES,
    };
    const { result } = renderHook(() => useScopedGrades());

    expect(result.current.isScoped).toBe(true);
    expect(result.current.source).toBe("grades");
    // Two class groups of the same grade collapse to one grade...
    expect(result.current.gradeIds).toEqual([24]);
    // ...but both class groups are kept.
    expect(result.current.classGroupIds).toEqual([101, 102]);
    expect(result.current.defaultClassGroupId).toBe(101);
  });

  it("expands a program lead's programs into every grade underneath", () => {
    mockUser = {
      assignedGrades: [],
      assignedPrograms: [{ program_id: 8, name: "Coding Academy" }],
      allGrades: ALL_GRADES,
    };
    const { result } = renderHook(() => useScopedGrades());

    expect(result.current.isScoped).toBe(true);
    expect(result.current.source).toBe("programs");
    expect(result.current.gradeIds.sort()).toEqual([24, 25]);
    expect(result.current.gradeIds).not.toContain(15);
  });

  it("prefers grade assignments over program assignments when both exist", () => {
    mockUser = {
      assignedGrades: [
        {
          grade_id: 15,
          name: "Grade 5",
          program_id: 6,
          class_group_id: 200,
          class_group_name: "Grade 5 A",
        },
      ],
      assignedPrograms: [{ program_id: 8, name: "Coding Academy" }],
      allGrades: ALL_GRADES,
    };
    const { result } = renderHook(() => useScopedGrades());

    expect(result.current.source).toBe("grades");
    expect(result.current.gradeIds).toEqual([15]);
  });

  it("stays scoped when a program has no grades yet, rather than falling open", () => {
    mockUser = {
      assignedGrades: [],
      assignedPrograms: [{ program_id: 99, name: "Empty Program" }],
      allGrades: ALL_GRADES,
    };
    const { result } = renderHook(() => useScopedGrades());

    expect(result.current.isScoped).toBe(true);
    expect(result.current.gradeIds).toEqual([]);
  });
});
