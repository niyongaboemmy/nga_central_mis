import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { CourseCategory, Grade, GradeSubject, Program, Subject } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { nameKey, planGradeImport, planSubjectImport } from "../services/academics/bulkImport";

/**
 * Excel bulk upload of grades and subjects: names compared lower-cased,
 * a dry run that saves nothing, and a commit that saves only the valid rows.
 */
const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let admin: string, teacher: string, programId: number, programName: string;

beforeAll(async () => {
  const a = await createUser({ userType: "ADMIN" });
  await assignRole(a, await createRoleWithPermissions(`bulk_import_admin_${tag}`, ["MANAGE_ACADEMICS"]));
  admin = signToken(a);
  teacher = signToken(await createUser({ userType: "TEACHER" }));
  programName = `Bulk Prog ${tag}`;
  // Program.program_id has no AUTO_INCREMENT in cloned test schemas (see fixtures.nextId).
  const [[{ next }]] = (await db.execute(sql`SELECT COALESCE(MAX(program_id), 0) + 1 AS next FROM Program`)) as any;
  programId = Number(next);
  await db.insert(Program).values({ program_id: programId, name: programName });
});

const post = (path: string, token: string, body: object) =>
  request(app).post(`/academics/${path}`).set("Authorization", `Bearer ${token}`).send(body);

describe("nameKey", () => {
  it("ignores case and extra spaces", () => {
    expect(nameKey("  SPES   Year 1 ")).toBe("spes year 1");
    expect(nameKey("Spes year 1")).toBe(nameKey("SPES YEAR 1"));
  });
});

describe("planGradeImport", () => {
  const programs = [{ program_id: 1, name: "SPES" }];
  const grades = [{ grade_id: 9, program_id: 1, name: "Year 1", level_order: 5, rqf_level: 3 }];

  it("matches programs and existing grades ignoring case, and numbers new grades after the last one", () => {
    const plan = planGradeImport(
      [
        { line: 2, name: "YEAR 1", program: "spes" },
        { line: 3, name: "Year 2", program: " Spes " },
        { line: 4, name: "year 2", program: "SPES" },
        { line: 5, name: "Year 3", program: "Nope" },
        { line: 6, name: "Year 1", program: "spes", level_order: "7", rqf_level: "Level 4" },
      ],
      programs,
      grades,
    );
    expect(plan.map((p) => p.result.action)).toEqual(["skip", "create", "error", "error", "error"]);
    expect(plan[1].insert).toMatchObject({ program_id: 1, name: "Year 2", level_order: 6 });
    expect(plan[2].result.errors[0]).toMatch(/line 3/);
    expect(plan[3].result.errors[0]).toMatch(/No program called "Nope"/);
    expect(plan[4].result.errors[0]).toMatch(/line 2/);
  });

  it("updates level order / RQF of an existing grade and warns on a shared level", () => {
    const plan = planGradeImport(
      [
        { line: 2, name: "year 1", program: "SPES", level_order: 6, rqf_level: "L4" },
        { line: 3, name: "Year 2", program: "SPES", level_order: 6 },
        { line: 4, name: "Year 3", program: "SPES", rqf_level: 9 },
      ],
      programs,
      grades,
    );
    expect(plan[0].result.action).toBe("update");
    expect(plan[0].update).toEqual({ grade_id: 9, level_order: 6, rqf_level: 4 });
    expect(plan[1].result.action).toBe("create");
    expect(plan[1].result.warnings.join(" ")).toMatch(/also used by Year 1/);
    expect(plan[2].result.errors[0]).toMatch(/RQF level/);
  });
});

describe("planSubjectImport", () => {
  const ctx = {
    targetGradeId: 1,
    grades: [
      { grade_id: 1, name: "Year 1", program_name: "SPES" },
      { grade_id: 2, name: "Year 2", program_name: "SPES" },
      { grade_id: 3, name: "Year 2", program_name: "CSA" },
    ],
    subjects: [
      { subject_id: 50, code: "MATH101", name: "Mathematics", color: "#111111", status: "ACTIVE" },
      { subject_id: 51, code: "OLD1", name: "Old", color: null, status: "DISABLED" },
    ],
    categories: [{ category_id: 7, name: "Core" }],
    links: [{ grade_id: 1, subject_id: 50 }],
  };

  it("creates new subjects, links existing ones by code or name, and reports problems per row", () => {
    const plan = planSubjectImport(
      [
        { line: 2, name: "Physics", code: "PHY101", category: "core", max_marks: "100", color: "3b82f6" },
        { line: 3, name: "mathematics" },
        { line: 4, name: "Maths again", code: "math101", grades: "year 2 (spes)" },
        { line: 5, name: "Chemistry", grades: "Year 2" },
        { line: 6, name: "Biology", category: "Science", max_marks: "abc", color: "blue" },
        { line: 7, name: "physics", code: "phy101" },
        { line: 8, name: "Archived", code: "old1" },
      ],
      ctx,
    );
    expect(plan.map((p) => p.result.action)).toEqual(["create", "skip", "assign", "error", "error", "error", "error"]);
    expect(plan[0].insert).toMatchObject({ code: "PHY101", course_category_id: 7, max_marks: 100, color: "#3B82F6" });
    expect(plan[0].gradeIds).toEqual([1]);
    expect(plan[2]).toMatchObject({ subjectId: 50, gradeIds: [2] });
    expect(plan[3].result.errors[0]).toMatch(/matches 2 grades/);
    expect(plan[4].result.errors).toHaveLength(3);
    expect(plan[5].result.errors[0]).toMatch(/line 2/);
    expect(plan[6].result.errors[0]).toMatch(/disabled subject/);
  });

  it("needs a grade from the picker or the grades column", () => {
    const [p] = planSubjectImport([{ line: 2, name: "Art" }], { ...ctx, targetGradeId: null });
    expect(p.result.errors[0]).toMatch(/No grade/);
  });
});

describe("POST /academics/grades/bulk-import", () => {
  it("needs MANAGE_ACADEMICS", async () => {
    expect((await post("grades/bulk-import", teacher, { rows: [{ name: "x", program: programName }], dryRun: true })).status).toBe(403);
  });

  it("checks without saving, then saves only the valid rows", async () => {
    const rows = [
      { line: 2, name: `G1 ${tag}`, program: programName.toUpperCase(), level_order: 901, rqf_level: 3 },
      { line: 3, name: `g1 ${tag}`, program: programName },
      { line: 4, name: `G2 ${tag}`, program: "no such program" },
    ];
    const dry = await post("grades/bulk-import", admin, { rows, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.data).toMatchObject({ dryRun: true, total: 3, create: 1, error: 2 });
    expect(await db.select().from(Grade).where(eq(Grade.program_id, programId))).toHaveLength(0);

    const done = await post("grades/bulk-import", admin, { rows, dryRun: false });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ dryRun: false, create: 1, error: 2 });
    const saved = await db.select().from(Grade).where(eq(Grade.program_id, programId));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: `G1 ${tag}`, level_order: 901, rqf_level: 3 });

    // Same file again: the grade is there already, nothing new.
    const again = await post("grades/bulk-import", admin, { rows: rows.slice(0, 1), dryRun: false });
    expect(again.body.data).toMatchObject({ create: 0, skip: 1 });
  });

  it("refuses an empty sheet", async () => {
    expect((await post("grades/bulk-import", admin, { rows: [], dryRun: true })).status).toBe(400);
  });
});

describe("POST /academics/subjects/bulk-import", () => {
  it("creates subjects in the selected grade and links existing ones", async () => {
    const [g1] = (await db.insert(Grade).values({ program_id: programId, name: `S1 ${tag}`, level_order: 911 })) as any;
    const [g2] = (await db.insert(Grade).values({ program_id: programId, name: `S2 ${tag}`, level_order: 912 })) as any;
    const grade1 = Number(g1.insertId), grade2 = Number(g2.insertId);
    const catName = `Cat ${tag}`;
    await db.insert(CourseCategory).values({ name: catName });
    const [ex] = (await db.insert(Subject).values({ name: `Existing ${tag}`, code: `EX${tag}` })) as any;
    const existingId = Number(ex.insertId);

    const rows = [
      { line: 2, name: `New ${tag}`, code: `NW${tag}`, category: catName.toLowerCase(), module_weight: "80", grades: `s2 ${tag}` },
      { line: 3, name: "Whatever", code: `ex${tag}`.toUpperCase() },
      { line: 4, name: `Bad ${tag}`, max_marks: "5000" },
    ];
    expect((await post("subjects/bulk-import", admin, { rows, grade_id: 999999999, dryRun: true })).status).toBe(400);

    const dry = await post("subjects/bulk-import", admin, { rows, grade_id: grade1, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.data).toMatchObject({ create: 1, assign: 1, error: 1 });
    expect(await db.select().from(Subject).where(eq(Subject.code, `NW${tag}`))).toHaveLength(0);

    const done = await post("subjects/bulk-import", admin, { rows, grade_id: grade1, dryRun: false });
    expect(done.status).toBe(200);
    const [created] = await db.select().from(Subject).where(eq(Subject.code, `NW${tag}`));
    expect(created).toMatchObject({ name: `New ${tag}`, module_weight: 80 });
    expect(created.color).toMatch(/^#[0-9A-F]{6}$/i);

    const links = await db
      .select()
      .from(GradeSubject)
      .where(inArray(GradeSubject.subject_id, [created.subject_id, existingId]));
    const pairs = links.map((l) => `${l.grade_id}:${l.subject_id}`).sort();
    expect(pairs).toEqual([`${grade1}:${created.subject_id}`, `${grade1}:${existingId}`, `${grade2}:${created.subject_id}`].sort());
    expect(await db.select().from(Subject).where(eq(Subject.name, `Bad ${tag}`))).toHaveLength(0);

    // Uploading the same sheet again links nothing twice.
    const again = await post("subjects/bulk-import", admin, { rows: rows.slice(0, 2), grade_id: grade1, dryRun: false });
    expect(again.body.data).toMatchObject({ create: 0, assign: 0, skip: 2 });
    const linksAfter = await db
      .select()
      .from(GradeSubject)
      .where(and(eq(GradeSubject.grade_id, grade1), eq(GradeSubject.subject_id, existingId)));
    expect(linksAfter).toHaveLength(1);
  });
});

describe("POST /academics/subjects (module weight)", () => {
  it("saves the module weight on create", async () => {
    const res = await post("subjects", admin, { name: `Weighted ${tag}`, code: `WT${tag}`, module_weight: 60 });
    expect(res.status).toBe(201);
    const [s] = await db.select().from(Subject).where(eq(Subject.code, `WT${tag}`));
    expect(s.module_weight).toBe(60);
  });
});
