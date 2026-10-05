import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { User, UserProfile } from "../db/schema";
import {
  createAcademicPeriod, createProgramGradeClassGroup, createProgramGradeClassGroupDetailed, createStudentClassGroup, createSubject,
  createTeacherSubjectAssignment, createUser, createUserGradeAssignment,
} from "../test/fixtures";
import { loadTeacherClasses, shortName } from "../services/desktop/classes";
import { desktopToolsRouter } from "../routes/desktopTools";

describe("desktop tools class lists", () => {
  it("shortens names for the projector", () => {
    expect(shortName("Aline", "Uwase")).toBe("Aline U.");
    expect(shortName("  Jean ", "")).toBe("Jean");
    expect(shortName(null, "mugisha")).toBe("M.");
    expect(shortName(null, null)).toBe("?");
  });

  it("lists only the classes a teacher teaches or leads, with active students", async () => {
    const { academicYearId } = await createAcademicPeriod();
    const taught = await createProgramGradeClassGroup();
    const ledChain = await createProgramGradeClassGroupDetailed();
    const led = ledChain.classGroupId;
    const other = await createProgramGradeClassGroup();
    const teacher = await createUser({ userType: "TEACHER" });
    const subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacher, subjectId, classGroupId: taught, academicYearId });
    await createUserGradeAssignment({ userId: teacher, gradeId: ledChain.gradeId, classGroupId: led, academicYearId });
    const s1 = await createUser({ userType: "STUDENT" });
    const s2 = await createUser({ userType: "STUDENT" });
    const gone = await createUser({ userType: "STUDENT" });
    const elsewhere = await createUser({ userType: "STUDENT" });
    await db.update(UserProfile).set({ first_name: "Aline", last_name: "Uwase" }).where(eq(UserProfile.user_id, s1));
    await db.update(UserProfile).set({ first_name: "Brian", last_name: "Habimana" }).where(eq(UserProfile.user_id, s2));
    await db.update(User).set({ status: "INACTIVE" } as any).where(eq(User.user_id, gone));
    for (const s of [s1, s2, gone]) await createStudentClassGroup({ userId: s, classGroupId: taught, academicYearId });
    await createStudentClassGroup({ userId: elsewhere, classGroupId: other, academicYearId });

    const classes = await loadTeacherClasses(teacher);
    expect(classes.map((c) => c.classGroupId).sort()).toEqual([taught, led].sort());
    const t = classes.find((c) => c.classGroupId === taught)!;
    expect(t.students).toEqual([{ id: s1, name: "Aline U." }, { id: s2, name: "Brian H." }]);
    expect(classes.find((c) => c.classGroupId === led)!.students).toEqual([]);
    expect(classes.some((c) => c.classGroupId === other)).toBe(false);
  });

  it("someone who teaches nothing gets no lists", async () => {
    await createAcademicPeriod();
    expect(await loadTeacherClasses(await createUser({ userType: "STUDENT" }))).toEqual([]);
  });

  it("serves the lists to the signed-in person only", async () => {
    const app = express();
    app.use("/desktop/tools", desktopToolsRouter(
      (req: any, res, next) => (req.headers.authorization === "Bearer ok" ? ((req.user = { userId: 9 }), next()) : res.status(401).json({})),
      { collect: async () => [], classes: async (id) => [{ classGroupId: 1, name: `for ${id}`, grade: "S1", students: [] }] },
    ));
    expect((await request(app).get("/desktop/tools/classes")).status).toBe(401);
    const res = await request(app).get("/desktop/tools/classes").set("Authorization", "Bearer ok");
    expect(res.body.data.classes[0].name).toBe("for 9");
  });
});
