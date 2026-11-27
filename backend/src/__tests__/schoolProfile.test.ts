import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { School, Subject } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";

/**
 * The school's identity block for report cards (migration 142):
 * GET /schools/profile for any signed-in user, PUT with MANAGE_SCHOOLS (only
 * the identity fields, validated); and a subject's module_weight.
 */
let admin: number, teacher: number, academics: number;
let schoolId: number;
let before: any;
let subjectId: number;

beforeAll(async () => {
  admin = await createUser({ userType: "ADMIN" });
  await assignRole(admin, await createRoleWithPermissions("school_admin_profile", ["MANAGE_SCHOOLS"]));
  academics = await createUser({ userType: "ADMIN" });
  await assignRole(academics, await createRoleWithPermissions("academics_admin_weight", ["MANAGE_ACADEMICS"]));
  teacher = await createUser({ userType: "TEACHER" });
  const rows = await db.select().from(School);
  if (!rows.length) {
    await db.insert(School).values({ name: `Profile School ${Date.now()}`, status: "ACTIVE" } as any);
  }
  const all = await db.select().from(School);
  const active = all.filter((r: any) => r.status === "ACTIVE").sort((a: any, b: any) => a.school_id - b.school_id)[0] ?? all[0];
  schoolId = active.school_id;
  before = { ...active };
  const [r] = (await db.insert(Subject).values({ name: `Weight subject ${Date.now()}`, code: `WT${Date.now() % 100000}` } as any)) as any;
  subjectId = r.insertId;
});

afterAll(async () => {
  await db
    .update(School)
    .set({ district: before.district ?? null, head_teacher_name: before.head_teacher_name ?? null, contact_phone: before.contact_phone ?? null } as any)
    .where(eq(School.school_id, schoolId));
  await db.delete(Subject).where(eq(Subject.subject_id, subjectId));
});

describe("school profile", () => {
  it("is readable by any signed-in user, with whether they may edit it", async () => {
    const res = await request(app).get("/schools/profile").set("Authorization", `Bearer ${signToken(teacher)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.school_id).toBe(schoolId);
    expect(res.body.data).toHaveProperty("district");
    expect(res.body.data).toHaveProperty("head_teacher_name");
    expect(res.body.can_edit).toBe(false);
    expect((await request(app).get("/schools/profile")).status).toBe(401);
  });

  it("saves only the identity fields for MANAGE_SCHOOLS, and validates them", async () => {
    const put = (u: number, body: object) => request(app).put("/schools/profile").set("Authorization", `Bearer ${signToken(u)}`).send(body);
    expect((await put(teacher, { district: "Gasabo" })).status).toBe(403);
    const ok = await put(admin, { district: " Gasabo ", head_teacher_name: "Head Sample", contact_phone: "", status: "SUSPENDED" });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ district: "Gasabo", head_teacher_name: "Head Sample", contact_phone: null });
    const [row] = await db.select().from(School).where(eq(School.school_id, schoolId));
    expect((row as any).status).toBe(before.status); // not an identity field: untouched
    expect((await put(admin, { district: "x".repeat(101) })).status).toBe(400);
    expect((await put(admin, { contact_email: "not-an-email" })).status).toBe(400);
    expect((await put(admin, { name: "" })).status).toBe(400);
    expect((await put(admin, {})).status).toBe(400);
    const read = await request(app).get("/schools/profile").set("Authorization", `Bearer ${signToken(admin)}`);
    expect(read.body).toMatchObject({ can_edit: true, data: { district: "Gasabo" } });
  });
});

describe("subject module weight", () => {
  it("is saved with MANAGE_ACADEMICS, validated, and listed", async () => {
    const put = (body: object) => request(app).put(`/academics/subjects/${subjectId}`).set("Authorization", `Bearer ${signToken(academics)}`).send(body);
    expect((await put({ module_weight: 80 })).status).toBe(200);
    let [row] = await db.select().from(Subject).where(eq(Subject.subject_id, subjectId));
    expect((row as any).module_weight).toBe(80);
    expect((await put({ module_weight: 0 })).status).toBe(400);
    expect((await put({ module_weight: 12.5 })).status).toBe(400);
    expect((await put({ module_weight: null })).status).toBe(200);
    [row] = await db.select().from(Subject).where(eq(Subject.subject_id, subjectId));
    expect((row as any).module_weight).toBeNull();
  });
});

describe("document letterhead footer (migration 150)", () => {
  it("saves footer text line by line, refuses more than four lines, and returns it", async () => {
    const save = await request(app)
      .put("/schools/profile")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ documents_footer_text: "  Tel: +250 700 000 000  \n\n  www.school.example \n" });
    expect(save.status).toBe(200);
    expect(save.body.data.documents_footer_text).toBe("Tel: +250 700 000 000\nwww.school.example");
    expect(save.body.data).toHaveProperty("documents_footer_url");

    const tooMany = await request(app)
      .put("/schools/profile")
      .set("Authorization", `Bearer ${signToken(admin)}`)
      .send({ documents_footer_text: "1\n2\n3\n4\n5" });
    expect(tooMany.status).toBe(400);

    const read = await request(app).get("/schools/profile").set("Authorization", `Bearer ${signToken(teacher)}`);
    expect(read.body.data.documents_footer_text).toBe("Tel: +250 700 000 000\nwww.school.example");
    await db.update(School).set({ documents_footer_text: before.documents_footer_text ?? null } as any).where(eq(School.school_id, schoolId));
  });
});
