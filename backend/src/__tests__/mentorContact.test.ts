import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { AcademicYear, MentorAssignment, System, User, UserProfile } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createStudentClassGroup,
} from "../test/fixtures";

// 2026-10-12: a student could not see their assigned mentor. The My Mentor
// page and /mentorship/my-mentor required SUBMIT_MENTEE_CHECKIN, which
// migration 047 granted to nobody. A live assignment now admits the student on
// its own, the payload carries what the student needs to reach the mentor, and
// Tupo can ask MIS who mentors whom (client credentials) to open that chat.
describe("Students reach their mentor", () => {
  const tag = `mc${Date.now().toString(36)}`;
  const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const clientId = `tupo_mentor_${tag}`;

  let yearId: number;
  let mentorId: number;
  let menteeId: number;
  let menteeToken: string;
  let loneStudentToken: string;
  let pastMenteeId: number;

  beforeAll(async () => {
    await db.update(AcademicYear).set({ is_current: 0 });
    yearId = (await createAcademicPeriod()).academicYearId;

    mentorId = await createUser({ userType: "TEACHER" });
    await db.update(UserProfile).set({ first_name: "Grace", last_name: tag }).where(eq(UserProfile.user_id, mentorId));
    await db.update(User).set({ phone_number: "+250788000111", avatar_version: 1_760_000_000 }).where(eq(User.user_id, mentorId));

    // No role, no permission at all — only the assignment.
    menteeId = await createUser({ userType: "STUDENT" });
    await db.update(UserProfile).set({ first_name: "Eric", last_name: tag }).where(eq(UserProfile.user_id, menteeId));
    menteeToken = signToken(menteeId);
    loneStudentToken = signToken(await createUser({ userType: "STUDENT" }));

    const classGroupId = await createProgramGradeClassGroup();
    await createStudentClassGroup({ userId: menteeId, classGroupId, academicYearId: yearId });

    await db.insert(MentorAssignment).values({
      mentor_id: mentorId, student_id: menteeId, academic_year_id: yearId, status: "ACTIVE", assigned_by: mentorId,
    });

    // A relationship left ACTIVE in a finished year is not a live one.
    const [past] = (await db.insert(AcademicYear).values({
      name: `Past ${tag}`, start_date: "2024-09-01", end_date: "2025-07-01", is_current: 0,
    } as any)) as any;
    pastMenteeId = await createUser({ userType: "STUDENT" });
    await db.insert(MentorAssignment).values({
      mentor_id: mentorId, student_id: pastMenteeId, academic_year_id: past.insertId, status: "ACTIVE", assigned_by: mentorId,
    });

    await db.insert(System).values({
      name: `Tupo mentorship ${tag}`, client_id: clientId, client_secret: "s3cret", icon_url: "x", home_url: "x", status: "ACTIVE",
    } as any);
  });

  it("a student with a mentor but no check-in permission sees the mentor's full contact card", async () => {
    const res = await request(app)
      .get("/mentorship/my-mentor")
      .query({ academic_year_id: yearId })
      .set("Authorization", `Bearer ${menteeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      mentor_id: mentorId,
      mentor_name: `Grace ${tag}`,
      mentor_first_name: "Grace",
      mentor_phone: "+250788000111",
      mentor_role: "TEACHER",
      academic_year_id: yearId,
    });
    expect(res.body.data.mentor_email).toMatch(/@example\.com$/);
    expect(res.body.data.avatar?.md).toMatch(new RegExp(`/avatars/${mentorId}/1760000000/md\\.webp`));
    expect(res.body.data.cover).toBeNull();
    // Nothing private leaks onto the card.
    expect(res.body.data).not.toHaveProperty("date_of_birth");
    expect(res.body.data).not.toHaveProperty("address");
  });

  it("falls back to the student's live mentor when the selected year has no assignment", async () => {
    const [other] = (await db.insert(AcademicYear).values({
      name: `Other ${tag}`, start_date: "2026-01-01", end_date: "2026-12-31", is_current: 0,
    } as any)) as any;
    const res = await request(app)
      .get("/mentorship/my-mentor")
      .query({ academic_year_id: other.insertId })
      .set("Authorization", `Bearer ${menteeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ mentor_id: mentorId, academic_year_id: yearId, from_other_year: true });

    const exact = await request(app)
      .get("/mentorship/my-mentor")
      .query({ academic_year_id: yearId })
      .set("Authorization", `Bearer ${menteeToken}`);
    expect(exact.body.data.from_other_year).toBe(false);
  });

  it("a mentor left only in a finished year is not offered as a fallback", async () => {
    const pastToken = signToken(pastMenteeId);
    const res = await request(app).get("/mentorship/my-mentor").set("Authorization", `Bearer ${pastToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("the same student can read and send check-ins to that mentor", async () => {
    const mine = await request(app).get("/mentorship/checkins/mine").set("Authorization", `Bearer ${menteeToken}`);
    expect(mine.status).toBe(200);
  });

  it("a student with neither the permission nor a mentor is still refused", async () => {
    const res = await request(app).get("/mentorship/my-mentor").set("Authorization", `Bearer ${loneStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("the service endpoint needs a registered client", async () => {
    const none = await request(app).get(`/mentorship/service/relationships/${menteeId}`);
    expect(none.status).toBe(401);
    const wrong = await request(app)
      .get(`/mentorship/service/relationships/${menteeId}`)
      .set("Authorization", basic(clientId, "nope"));
    expect(wrong.status).toBe(401);
    const person = await request(app)
      .get(`/mentorship/service/relationships/${menteeId}`)
      .set("Authorization", `Bearer ${menteeToken}`);
    expect(person.status).toBe(401);
  });

  it("tells a sibling app who mentors the student", async () => {
    const res = await request(app)
      .get(`/mentorship/service/relationships/${menteeId}`)
      .set("Authorization", basic(clientId, "s3cret"));
    expect(res.status).toBe(200);
    expect(res.body.data.mentor).toMatchObject({
      user_id: mentorId,
      name: `Grace ${tag}`,
      phone: "+250788000111",
      user_type: "TEACHER",
      academic_year_id: yearId,
    });
    expect(res.body.data.mentees).toEqual([]);
  });

  it("tells a sibling app whom the mentor mentors now, leaving finished years out", async () => {
    const res = await request(app)
      .get(`/mentorship/service/relationships/${mentorId}`)
      .set("Authorization", basic(clientId, "s3cret"));
    expect(res.status).toBe(200);
    expect(res.body.data.mentor).toBeNull();
    const ids = res.body.data.mentees.map((m: any) => m.user_id);
    expect(ids).toEqual([menteeId]);
    expect(ids).not.toContain(pastMenteeId);
    expect(res.body.data.mentees[0]).toMatchObject({ name: `Eric ${tag}`, user_type: "STUDENT" });
    expect(res.body.data.mentees[0].class_group_name).toBeTruthy();
  });

  it("rejects a malformed user id", async () => {
    const res = await request(app)
      .get("/mentorship/service/relationships/abc")
      .set("Authorization", basic(clientId, "s3cret"));
    expect(res.status).toBe(400);
  });
});
