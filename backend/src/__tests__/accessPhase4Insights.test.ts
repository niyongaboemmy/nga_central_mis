import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import { SchemeOfWork } from "../db/schema";
import {
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSchemeOfWork,
  createSubject,
  createUser,
  signToken,
} from "../test/fixtures";
import { ensureAccessRegistry } from "../services/access/registry";

/**
 * Access control v2 -- Phase 4 Leadership Insights: aggregates only, scoped to
 * the viewer's node, small groups suppressed, no individual records.
 */

const presetRole = async (key: string) =>
  (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1))[0].role_id;

async function grant(userId: number, preset: string, scopeType: string, scopeId: number | null = null) {
  await db.insert(AccessGrant).values({
    user_id: userId, role_id: await presetRole(preset), scope_type: scopeType as any, scope_id: scopeId, source: "MANUAL", status: "ACTIVE",
  });
  await db.update(UserAccessVersion).set({ access_version: sql`${UserAccessVersion.access_version} + 1` }).where(eq(UserAccessVersion.user_id, userId));
}

let prog: { programId: number; gradeId: number; classGroupId: number };
let small: { classGroupId: number };
let other: { programId: number };
let viewer: number;
let dosHere: number;
let dosElsewhere: number;
let teacher: number;

beforeAll(async () => {
  await ensureAccessRegistry();
  const { academicTermId } = await createAcademicPeriod();
  prog = await createProgramGradeClassGroupDetailed();
  small = await createProgramGradeClassGroupDetailed({ programId: prog.programId }); // second grade, same programme
  other = await createProgramGradeClassGroupDetailed();
  const subject = await createSubject();
  const author = await createUser();

  // Big class: 6 schemes, 4 approved. Small class: 2 schemes (below the cohort floor).
  for (let i = 0; i < 6; i++) {
    const id = await createSchemeOfWork({ userId: author, subjectId: subject, classGroupId: prog.classGroupId, academicTermId });
    if (i < 4) await db.update(SchemeOfWork).set({ validation_status: "APPROVED" }).where(eq(SchemeOfWork.scheme_id, id));
  }
  for (let i = 0; i < 2; i++) {
    await createSchemeOfWork({ userId: author, subjectId: subject, classGroupId: small.classGroupId, academicTermId });
  }

  viewer = await createUser({ userType: "ADMIN" });
  await grant(viewer, "academic_insights_viewer", "SCHOOL");
  dosHere = await createUser();
  await grant(dosHere, "director_of_studies", "PROGRAM", prog.programId);
  dosElsewhere = await createUser();
  await grant(dosElsewhere, "director_of_studies", "PROGRAM", other.programId);
  teacher = await createUser();
});

const get = (userId: number, path: string) => request(app).get(path).set("Authorization", `Bearer ${signToken(userId)}`);

describe("Leadership Insights", () => {
  it("gives the insights viewer a programme dashboard with grade summaries, suppressing small groups", async () => {
    const res = await get(viewer, `/access/insights/curriculum.sow_validation?node=PROGRAM:${prog.programId}`);
    expect(res.status).toBe(200);
    const body = res.body.data;
    expect(body.groupBy).toBe("GRADE");
    expect(body.depth).toBe("summary");
    const big = body.rows.find((r: any) => r.key === prog.gradeId);
    expect(big).toMatchObject({ n: 6, value: 66.7, suppressed: false });
    const tiny = body.rows.find((r: any) => r.n === 2);
    expect(tiny).toMatchObject({ value: null, suppressed: true });
    expect(body.total).toMatchObject({ n: 8, value: 50, suppressed: false });
    // Aggregates only: no per-person fields anywhere in the payload.
    expect(JSON.stringify(body)).not.toMatch(/user_id|username|first_name|email/);
  });

  it("scopes a DOS to their programme", async () => {
    expect((await get(dosHere, `/access/insights/curriculum.sow_validation?node=PROGRAM:${prog.programId}`)).status).toBe(200);
    expect((await get(dosElsewhere, `/access/insights/curriculum.sow_validation?node=PROGRAM:${prog.programId}`)).status).toBe(403);
    // A programme grant does not cover the whole school.
    expect((await get(dosHere, `/access/insights/curriculum.sow_validation?node=SCHOOL`)).status).toBe(403);
  });

  it("refuses people without the capability, and groupings below class level", async () => {
    expect((await get(teacher, `/access/insights/curriculum.sow_validation?node=SCHOOL`)).status).toBe(403);
    expect((await get(viewer, `/access/insights/curriculum.sow_validation?node=SCHOOL&groupBy=STUDENT`)).status).toBe(400);
    expect((await get(viewer, `/access/insights/nope?node=SCHOOL`)).status).toBe(404);
    expect((await get(viewer, `/access/insights/curriculum.sow_validation?node=GRADE:abc`)).status).toBe(400);
  });

  it("lists the widgets each viewer can open at a node", async () => {
    const mine = await get(viewer, `/access/insights/widgets?node=SCHOOL`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((w: any) => w.metric)).toEqual(
      expect.arrayContaining(["curriculum.sow_validation", "teaching.lesson_reports", "elearning.progress"]),
    );
    const none = await get(teacher, `/access/insights/widgets?node=SCHOOL`);
    expect(none.body.data).toEqual([]);
    const dos = await get(dosHere, `/access/insights/widgets?node=PROGRAM:${prog.programId}`);
    expect(dos.body.data.length).toBeGreaterThan(0);
    const dosSchool = await get(dosHere, `/access/insights/widgets?node=SCHOOL`);
    expect(dosSchool.body.data).toEqual([]);
  });
});
