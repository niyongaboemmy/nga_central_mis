import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AcademicYear, MenteeCheckIn, MentorAssignment, Notification, UserProfile } from "../db/schema";
import { Permissions } from "../utils/permissions";
import { createUser, signToken, createRoleWithPermissions, assignRole } from "../test/fixtures";
import { sweepWaitingCheckIns } from "../services/mentorship/notify";

// 2026-10-12: mentors (teachers and other staff) could only reach their mentees
// through Reporting, a mentee's page could not be linked to, and nothing in
// mentoring notified anyone. These cover the quick-access endpoints and every
// notice the module now sends. Years are created with explicit end dates and
// passed explicitly, so this file never flips the global is_current flag.
describe("Mentees quick access and mentorship notifications", () => {
  const tag = `mq${Date.now().toString(36)}`;

  let liveYearId: number;
  let emptyYearId: number;
  let pastYearId: number;

  let mentorId: number;
  let mentorToken: string;
  let otherMentorId: number;
  let otherMentorToken: string;
  let menteeId: number;
  let menteeToken: string;
  let pastMenteeId: number;
  let strangerId: number;
  let adminId: number;
  let adminToken: string;

  const notices = (userId: number, kind?: string) =>
    db
      .select()
      .from(Notification)
      .where(and(eq(Notification.user_id, userId), kind ? eq(Notification.kind, kind) : sql`1=1`));

  const year = async (name: string, end: string) => {
    const [r] = (await db.insert(AcademicYear).values({
      name: `${name} ${tag}`, start_date: "2024-09-01", end_date: end, is_current: 0,
    } as any)) as any;
    return r.insertId as number;
  };

  const named = async (userId: number, first: string) =>
    db.update(UserProfile).set({ first_name: first, last_name: tag }).where(eq(UserProfile.user_id, userId));

  beforeAll(async () => {
    liveYearId = await year("Live", "2099-07-01");
    emptyYearId = await year("Empty", "2099-07-01");
    pastYearId = await year("Past", "2025-07-01");

    // A staff mentor with no teacher permission at all: only the assignment.
    mentorId = await createUser({ userType: "STAFF" });
    await named(mentorId, "Grace");
    mentorToken = signToken(mentorId);
    otherMentorId = await createUser({ userType: "TEACHER" });
    await named(otherMentorId, "Paul");
    otherMentorToken = signToken(otherMentorId);

    menteeId = await createUser({ userType: "STUDENT" });
    await named(menteeId, "Eric");
    menteeToken = signToken(menteeId);
    pastMenteeId = await createUser({ userType: "STUDENT" });
    await named(pastMenteeId, "Old");
    strangerId = await createUser({ userType: "STUDENT" });

    adminId = await createUser({ userType: "ADMIN" });
    await assignRole(
      adminId,
      await createRoleWithPermissions("MENTEE_QA_ADMIN", [
        Permissions.MANAGE_MENTOR_ASSIGNMENTS,
        Permissions.MANAGE_REPORTS,
        Permissions.ALL_SUBMITTED_REPORTS,
      ]),
    );
    adminToken = signToken(adminId);

    await db.insert(MentorAssignment).values([
      { mentor_id: mentorId, student_id: menteeId, academic_year_id: liveYearId, status: "ACTIVE", assigned_by: adminId },
      { mentor_id: mentorId, student_id: pastMenteeId, academic_year_id: pastYearId, status: "ACTIVE", assigned_by: adminId },
    ]);
  });

  describe("quick access", () => {
    it("/me keeps the mentor entry when the selected year has no assignment", async () => {
      const res = await request(app)
        .get("/mentorship/me")
        .query({ academic_year_id: emptyYearId })
        .set("Authorization", `Bearer ${mentorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ is_mentor: true, mentee_count: 1, has_mentor: false, new_checkins: 0 });

      const student = await request(app)
        .get("/mentorship/me")
        .query({ academic_year_id: emptyYearId })
        .set("Authorization", `Bearer ${menteeToken}`);
      expect(student.body.data).toMatchObject({ is_mentor: false, has_mentor: true });
    });

    it("the roster falls back to today's mentees and says so", async () => {
      const res = await request(app)
        .get("/mentorship/students")
        .query({ academic_year_id: emptyYearId })
        .set("Authorization", `Bearer ${mentorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((s: any) => s.user_id)).toEqual([menteeId]);
      expect(res.body.data[0]).toMatchObject({
        from_other_year: true,
        academic_year_id: liveYearId,
        academic_year_name: `Live ${tag}`,
        can_log: true,
        new_checkins: 0,
        overdue: true,
      });

      const strict = await request(app)
        .get("/mentorship/students")
        .query({ academic_year_id: emptyYearId, fallback: "0" })
        .set("Authorization", `Bearer ${mentorToken}`);
      expect(strict.body.data).toEqual([]);
    });

    it("a finished year's mentee is read-only and never 'overdue'", async () => {
      const res = await request(app)
        .get("/mentorship/students")
        .query({ academic_year_id: pastYearId })
        .set("Authorization", `Bearer ${mentorToken}`);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ user_id: pastMenteeId, can_log: false, overdue: false, from_other_year: false });
    });

    it("one mentee's page can be opened from a link; strangers are 404", async () => {
      const ok = await request(app)
        .get(`/mentorship/students/${menteeId}`)
        .set("Authorization", `Bearer ${mentorToken}`);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ user_id: menteeId, first_name: "Eric", can_log: true });

      const stranger = await request(app)
        .get(`/mentorship/students/${strangerId}`)
        .set("Authorization", `Bearer ${mentorToken}`);
      expect(stranger.status).toBe(404);

      const notMine = await request(app)
        .get(`/mentorship/students/${menteeId}`)
        .set("Authorization", `Bearer ${otherMentorToken}`);
      // Paul mentors nobody, so the gate itself refuses him.
      expect([403, 404]).toContain(notMine.status);
    });
  });

  describe("check-ins", () => {
    let checkinId: number;

    it("a student's check-in reaches the mentor's bell without quoting the message", async () => {
      const res = await request(app)
        .post("/mentorship/checkins")
        .set("Authorization", `Bearer ${menteeToken}`)
        .send({ category: "REQUEST_MEETING", title: "Exam stress", message: "I feel overwhelmed by maths", academic_year_id: liveYearId });
      expect(res.status).toBe(201);
      checkinId = res.body.data.checkin_id;

      const [n] = await notices(mentorId, "mentorship_checkin");
      expect(n).toBeTruthy();
      expect(n.title).toBe(`Eric ${tag} asked to meet you`);
      expect(n.link).toBe(`/my-mentees/inbox?checkin=${checkinId}`);
      expect(n.subject_id).toBe(checkinId);
      expect(`${n.title} ${n.body}`).not.toContain("overwhelmed");

      const me = await request(app).get("/mentorship/me").set("Authorization", `Bearer ${mentorToken}`);
      expect(me.body.data.new_checkins).toBe(1);
      const row = await request(app).get(`/mentorship/students/${menteeId}`).set("Authorization", `Bearer ${mentorToken}`);
      expect(row.body.data.new_checkins).toBe(1);
      expect(row.body.data.last_checkin_at).toBeTruthy();
    });

    it("the mentee's page shows their thread with this mentor only", async () => {
      // Another mentor's check-in from the same student must not appear.
      await db.insert(MenteeCheckIn).values({
        student_id: menteeId, mentor_id: otherMentorId, academic_year_id: pastYearId,
        category: "GENERAL", message: "old thread", status: "NEW", validation_status: "PENDING",
      });
      const res = await request(app)
        .get(`/mentorship/students/${menteeId}/checkins`)
        .set("Authorization", `Bearer ${mentorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((c: any) => c.checkin_id)).toEqual([checkinId]);
      expect(res.body.data[0]).toMatchObject({ student_name: `Eric ${tag}`, category: "REQUEST_MEETING" });

      const stranger = await request(app)
        .get(`/mentorship/students/${strangerId}/checkins`)
        .set("Authorization", `Bearer ${mentorToken}`);
      expect(stranger.status).toBe(404);
    });

    it("opening a check-in marks it seen without telling the student it was answered", async () => {
      const res = await request(app)
        .patch(`/mentorship/checkins/${checkinId}`)
        .set("Authorization", `Bearer ${mentorToken}`)
        .send({ status: "ACKNOWLEDGED" });
      expect(res.status).toBe(200);
      const [row] = await db.select().from(MenteeCheckIn).where(eq(MenteeCheckIn.checkin_id, checkinId));
      expect(row.status).toBe("ACKNOWLEDGED");
      expect(row.responded_at).toBeNull();
      expect(await notices(menteeId, "mentorship_checkin_reply")).toHaveLength(0);
    });

    it("a reply notifies the student and links back to it", async () => {
      const res = await request(app)
        .patch(`/mentorship/checkins/${checkinId}`)
        .set("Authorization", `Bearer ${mentorToken}`)
        .send({ mentor_response: "  Let's meet Thursday at break.  " });
      expect(res.status).toBe(200);
      const [row] = await db.select().from(MenteeCheckIn).where(eq(MenteeCheckIn.checkin_id, checkinId));
      expect(row.mentor_response).toBe("Let's meet Thursday at break.");
      expect(row.responded_at).not.toBeNull();

      const [n] = await notices(menteeId, "mentorship_checkin_reply");
      expect(n.title).toBe(`Grace ${tag} replied to “Exam stress”`);
      expect(n.link).toBe(`/my-mentor?checkin=${checkinId}`);
      expect(n.actor_id).toBe(mentorId);
    });

    it("an admin's approval on the mentor's behalf is attributed to the school, not the mentor", async () => {
      await db.update(Notification).set({ read_at: sql`NOW()` }).where(eq(Notification.user_id, menteeId));
      const res = await request(app)
        .patch(`/mentorship/admin/checkins/${checkinId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ validation_status: "APPROVED" });
      expect(res.status).toBe(200);
      const [n] = await notices(menteeId, "mentorship_checkin_reply");
      expect(n.title).toBe("Your school's mentoring team approved “Exam stress”");
      // Same check-in, same notice row: bumped back to unread rather than stacked.
      expect(n.read_at).toBeNull();
      expect(await notices(menteeId, "mentorship_checkin_reply")).toHaveLength(1);
    });

    it("a mentor cannot answer another mentor's check-in", async () => {
      const res = await request(app)
        .patch(`/mentorship/checkins/${checkinId}`)
        .set("Authorization", `Bearer ${otherMentorToken}`)
        .send({ mentor_response: "hi" });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe("waiting check-ins sweep", () => {
    it("nudges the mentor once and escalates an unanswered concern once", async () => {
      const [a] = (await db.insert(MenteeCheckIn).values({
        student_id: menteeId, mentor_id: mentorId, academic_year_id: liveYearId,
        category: "GENERAL", message: "waiting", status: "NEW", validation_status: "PENDING",
      })) as any;
      const [b] = (await db.insert(MenteeCheckIn).values({
        student_id: menteeId, mentor_id: mentorId, academic_year_id: liveYearId,
        category: "CONCERN", message: "worried", status: "NEW", validation_status: "PENDING",
      })) as any;
      await db.execute(sql`UPDATE MenteeCheckIn SET submitted_at = DATE_SUB(NOW(), INTERVAL 50 HOUR) WHERE checkin_id = ${a.insertId}`);
      await db.execute(sql`UPDATE MenteeCheckIn SET submitted_at = DATE_SUB(NOW(), INTERVAL 80 HOUR) WHERE checkin_id = ${b.insertId}`);

      await sweepWaitingCheckIns();
      const nudges = await notices(mentorId, "mentorship_checkin_waiting");
      expect(nudges.map((n) => n.subject_id).sort()).toEqual([a.insertId, b.insertId].sort());
      expect(nudges.find((n) => n.subject_id === a.insertId)!.title).toBe(`Eric ${tag}'s check-in has waited 2 days`);

      // The test schema outlives a run, so only look at this run's two check-ins.
      const mine = <T extends { subject_id: number | null }>(rows: T[]) =>
        rows.filter((n) => n.subject_id === a.insertId || n.subject_id === b.insertId);
      const escalations = mine(await notices(adminId, "mentorship_checkin_escalated"));
      expect(escalations.map((n) => n.subject_id)).toEqual([b.insertId]);
      expect(`${escalations[0].title} ${escalations[0].body}`).not.toContain("worried");

      // Read them, sweep again: nothing is re-sent or re-opened.
      await db.update(Notification).set({ read_at: sql`NOW()` }).where(eq(Notification.user_id, mentorId));
      await sweepWaitingCheckIns();
      const again = await notices(mentorId, "mentorship_checkin_waiting");
      expect(again).toHaveLength(2);
      expect(again.every((n) => n.read_at !== null)).toBe(true);
      expect(mine(await notices(adminId, "mentorship_checkin_escalated"))).toHaveLength(1);
    });
  });

  describe("assignments", () => {
    it("a bulk assignment sends the mentor one notice and each student their own", async () => {
      const s1 = await createUser({ userType: "STUDENT" });
      const s2 = await createUser({ userType: "STUDENT" });
      await named(s1, "Ana");
      await named(s2, "Ben");
      const res = await request(app)
        .post("/mentorship/assignments/bulk")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mentor_id: otherMentorId, student_ids: [s1, s2], academic_year_id: liveYearId });
      expect(res.status).toBe(201);

      const mentorNotices = await notices(otherMentorId, "mentorship_assigned");
      expect(mentorNotices).toHaveLength(1);
      expect(mentorNotices[0].title).toBe("2 students are now your mentees");
      expect(mentorNotices[0].body).toContain(`Ana ${tag}`);
      for (const s of [s1, s2]) {
        const [n] = await notices(s, "mentorship_assigned");
        expect(n.title).toBe(`Paul ${tag} is now your mentor`);
        expect(n.link).toBe("/my-mentor");
      }
    });

    it("moving a student tells the previous mentor; re-assigning the same pair is silent", async () => {
      const res = await request(app)
        .post("/mentorship/assignments")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mentor_id: otherMentorId, student_id: menteeId, academic_year_id: liveYearId, reassign: true });
      expect(res.status).toBe(201);
      const [lost] = await notices(mentorId, "mentorship_ended");
      expect(lost.title).toBe(`Eric ${tag} moved to another mentor`);
      expect(lost.body).toContain(`Paul ${tag}`);

      const single = await notices(otherMentorId, "mentorship_assigned");
      expect(single.some((n) => n.title === `Eric ${tag} is now your mentee` && n.link === `/my-mentees/${menteeId}`)).toBe(true);

      const before = (await notices(menteeId, "mentorship_assigned")).length;
      const again = await request(app)
        .post("/mentorship/assignments")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mentor_id: otherMentorId, student_id: menteeId, academic_year_id: liveYearId });
      expect(again.status).toBe(200);
      expect((await notices(menteeId, "mentorship_assigned")).length).toBe(before);
    });

    it("ending an assignment tells both sides, once", async () => {
      const [row] = await db
        .select({ id: MentorAssignment.assignment_id })
        .from(MentorAssignment)
        .where(and(eq(MentorAssignment.student_id, menteeId), eq(MentorAssignment.mentor_id, otherMentorId), eq(MentorAssignment.status, "ACTIVE")));
      const end = await request(app).delete(`/mentorship/assignments/${row.id}`).set("Authorization", `Bearer ${adminToken}`);
      expect(end.status).toBe(200);
      expect((await notices(otherMentorId, "mentorship_ended")).map((n) => n.title)).toContain(`Eric ${tag} is no longer your mentee`);
      expect((await notices(menteeId, "mentorship_ended")).map((n) => n.title)).toContain(`Paul ${tag} is no longer your mentor`);

      const twice = await request(app).delete(`/mentorship/assignments/${row.id}`).set("Authorization", `Bearer ${adminToken}`);
      expect(twice.status).toBe(200);
      expect(twice.body.message).toBe("Assignment already ended");
      expect(await notices(menteeId, "mentorship_ended")).toHaveLength(1);
    });
  });
});
