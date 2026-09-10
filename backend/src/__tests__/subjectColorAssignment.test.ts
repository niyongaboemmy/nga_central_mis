import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { Subject } from "../db/schema";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  signToken,
  createSubject,
} from "../test/fixtures";

// POST /academics/subjects/assign-colors hands every subject a distinct
// calendar colour, so a catalogue left on the default blue stops rendering the
// timetable as one flat block.
describe("Subject colour assignment", () => {
  let token: string;

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("subject-colour-admin", [
      "MANAGE_ACADEMICS",
    ]);
    await assignRole(adminId, roleId);
    token = signToken(adminId);
  });

  it("assigns a distinct colour to each default-coloured subject", async () => {
    const ids = [
      await createSubject(),
      await createSubject(),
      await createSubject(),
      await createSubject(),
    ];

    const res = await request(app)
      .post("/academics/subjects/assign-colors")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBeGreaterThanOrEqual(ids.length);

    const rows = await db
      .select({ subject_id: Subject.subject_id, color: Subject.color })
      .from(Subject)
      .where(inArray(Subject.subject_id, ids));

    const colours = rows.map((r) => r.color);
    // all changed off the default and all distinct
    colours.forEach((c) => expect(c?.toLowerCase()).not.toBe("#3b82f6"));
    expect(new Set(colours).size).toBe(ids.length);
  });

  it("is idempotent — a second run changes nothing", async () => {
    await request(app)
      .post("/academics/subjects/assign-colors")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const second = await request(app)
      .post("/academics/subjects/assign-colors")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(second.status).toBe(200);
    expect(second.body.data.updated).toBe(0);
  });

  it("leaves a hand-picked colour untouched without force", async () => {
    const id = await createSubject();
    await db
      .update(Subject)
      .set({ color: "#abcdef" })
      .where(inArray(Subject.subject_id, [id]));

    await request(app)
      .post("/academics/subjects/assign-colors")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const [row] = await db
      .select({ color: Subject.color })
      .from(Subject)
      .where(inArray(Subject.subject_id, [id]));
    expect(row.color).toBe("#abcdef");
  });

  it("requires MANAGE_ACADEMICS", async () => {
    const nobody = await createUser({ userType: "TEACHER" });
    const res = await request(app)
      .post("/academics/subjects/assign-colors")
      .set("Authorization", `Bearer ${signToken(nobody)}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("a new subject created without a colour is not left on the default blue", async () => {
    const res = await request(app)
      .post("/academics/subjects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Auto Colour ${Date.now()}` });
    expect(res.status).toBe(201);
    expect(res.body.data.color?.toLowerCase()).not.toBe("#3b82f6");
    expect(res.body.data.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("still honours a colour the creator does choose", async () => {
    const res = await request(app)
      .post("/academics/subjects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Chosen Colour ${Date.now()}`, color: "#123abc" });
    expect(res.status).toBe(201);
    expect(res.body.data.color).toBe("#123abc");
  });
});
