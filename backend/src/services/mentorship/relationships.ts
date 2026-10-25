import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  AcademicYear,
  ClassGroup,
  MentorAssignment,
  StudentClassGroup,
  User,
  UserProfile,
} from "../../db/schema";
import { profileMedia } from "../avatar/urls";
import { activeUserJoin } from "../activeUsers";

/**
 * Who mentors whom right now, for one person, in the shape a sibling app needs
 * (Tupo's "Mentorship" page and its mentor-DM rule).
 *
 * "Right now" is the same unfinished-year rule the mentor routes use
 * (verifyStudentAccess): an ACTIVE assignment in the current year, or in one
 * whose end date is still ahead (or open). Rows left ACTIVE in a finished year —
 * notably migration 047's backfill — are not a live relationship.
 */

const liveYear = or(
  eq(AcademicYear.is_current, 1),
  sql`${AcademicYear.end_date} >= CURDATE()`,
  isNull(AcademicYear.end_date),
);

const fullName = (first: string | null, last: string | null) =>
  `${first ?? ""} ${last ?? ""}`.trim() || null;

export interface RelationshipPerson {
  user_id: number;
  name: string | null;
  email: string | null;
  user_type: string | null;
  avatar: ReturnType<typeof profileMedia>["avatar"];
  cover: ReturnType<typeof profileMedia>["cover"];
  academic_year_id: number;
  academic_year_name: string | null;
  assigned_at: string | null;
}

export interface MentorshipRelationships {
  user_id: number;
  mentor: (RelationshipPerson & { phone: string | null }) | null;
  mentees: (RelationshipPerson & { registration_number: string | null; class_group_name: string | null })[];
}

const iso = (d: unknown): string | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export async function mentorshipRelationshipsFor(userId: number): Promise<MentorshipRelationships> {
  const base = {
    email: User.email,
    phone: User.phone_number,
    avatar_version: User.avatar_version,
    cover_version: User.cover_version,
    first_name: UserProfile.first_name,
    last_name: UserProfile.last_name,
    user_type: UserProfile.user_type,
    academic_year_id: MentorAssignment.academic_year_id,
    academic_year_name: AcademicYear.name,
    is_current: AcademicYear.is_current,
    assigned_at: MentorAssignment.assigned_at,
  };

  const [mentorRows, menteeRows] = await Promise.all([
    db
      .select({ user_id: MentorAssignment.mentor_id, ...base })
      .from(MentorAssignment)
      .innerJoin(AcademicYear, eq(AcademicYear.academic_year_id, MentorAssignment.academic_year_id))
      .innerJoin(User, activeUserJoin(MentorAssignment.mentor_id))
      .leftJoin(UserProfile, eq(UserProfile.user_id, MentorAssignment.mentor_id))
      .where(and(eq(MentorAssignment.student_id, userId), eq(MentorAssignment.status, "ACTIVE"), liveYear))
      // The current year's mentor first, then the most recent assignment.
      .orderBy(desc(AcademicYear.is_current), desc(MentorAssignment.assigned_at))
      .limit(1),
    db
      .select({ user_id: MentorAssignment.student_id, registration_number: UserProfile.registration_number, ...base })
      .from(MentorAssignment)
      .innerJoin(AcademicYear, eq(AcademicYear.academic_year_id, MentorAssignment.academic_year_id))
      .innerJoin(User, activeUserJoin(MentorAssignment.student_id))
      .leftJoin(UserProfile, eq(UserProfile.user_id, MentorAssignment.student_id))
      .where(and(eq(MentorAssignment.mentor_id, userId), eq(MentorAssignment.status, "ACTIVE"), liveYear))
      .orderBy(desc(AcademicYear.is_current), desc(MentorAssignment.assigned_at)),
  ]);

  const person = (r: (typeof mentorRows)[number] | (typeof menteeRows)[number]): RelationshipPerson => {
    const media = profileMedia({ user_id: r.user_id, avatar_version: r.avatar_version, cover_version: r.cover_version });
    return {
      user_id: r.user_id,
      name: fullName(r.first_name, r.last_name),
      email: r.email ?? null,
      user_type: r.user_type ?? null,
      avatar: media.avatar,
      cover: media.cover,
      academic_year_id: r.academic_year_id,
      academic_year_name: r.academic_year_name ?? null,
      assigned_at: iso(r.assigned_at),
    };
  };

  // A mentee assigned in two unfinished years (this one and next) is listed once.
  const seen = new Set<number>();
  const mentees = menteeRows.filter((r) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)));

  const classOf = new Map<number, string | null>();
  if (mentees.length) {
    const classRows = await db
      .select({ user_id: StudentClassGroup.user_id, name: ClassGroup.name, academic_year_id: StudentClassGroup.academic_year_id })
      .from(StudentClassGroup)
      .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, StudentClassGroup.class_group_id))
      .where(and(inArray(StudentClassGroup.user_id, mentees.map((m) => m.user_id)), eq(StudentClassGroup.status, "ACTIVE")));
    const yearOf = new Map(mentees.map((m) => [m.user_id, m.academic_year_id]));
    for (const c of classRows) {
      // Prefer the class of the assignment's own year; fall back to any active one.
      if (c.academic_year_id === yearOf.get(c.user_id) || !classOf.has(c.user_id)) classOf.set(c.user_id, c.name ?? null);
    }
  }

  const mentorRow = mentorRows[0];
  return {
    user_id: userId,
    mentor: mentorRow ? { ...person(mentorRow), phone: mentorRow.phone ?? null } : null,
    mentees: mentees.map((m) => ({
      ...person(m),
      registration_number: m.registration_number ?? null,
      class_group_name: classOf.get(m.user_id) ?? null,
    })),
  };
}

