import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import {
  Course,
  CourseItem,
  CourseSection,
  LessonNote,
  LessonNoteShare,
} from "../db/schema";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createTeacherSubjectAssignment,
  createSchemeOfWork,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// A note read in the standalone reader earns no progress; the same note placed
// on a course is the thing the student is meant to work through. The library
// therefore carries a course placement — but only one the student may really
// open, because notes are shared far more widely than courses are.
describe("shared notes carry their course placement", () => {
  let studentToken: string;
  let studentId: number;
  let outsiderToken: string;
  let academicYearId: number;
  let academicTermId: number;
  let classGroupId: number;
  let subjectId: number;
  let teacherId: number;
  let publishedNote: number;
  let draftItemNote: number;
  let courseId: number;
  let itemId: number;

  const library = (token: string) =>
    request(app)
      .get("/lesson-notes/shared-with-me")
      .set("Authorization", `Bearer ${token}`);

  const makeNote = async (title: string) => {
    const [res] = (await db.insert(LessonNote).values({
      user_id: teacherId,
      subject_id: subjectId,
      class_group_id: classGroupId,
      academic_term_id: academicTermId,
      title,
      content_html: "<p>Body text for the reader.</p>",
      status: "PUBLISHED",
    } as any)) as any;
    const noteId = res.insertId as number;
    await db.insert(LessonNoteShare).values({
      note_id: noteId,
      shared_by: teacherId,
      filter_type: "class_group",
      filter_ids: [classGroupId],
    } as any);
    return noteId;
  };

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;
    const group = await createProgramGradeClassGroupDetailed();
    classGroupId = group.classGroupId;
    subjectId = await createSubject();

    teacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicYearId,
    });

    const role = await createRoleWithPermissions("library-student", [
      "VIEW_SHARED_LESSON_NOTES",
      "VIEW_MY_ENROLLED_SUBJECTS",
    ]);

    studentId = await createUser({ userType: "STUDENT" });
    await assignRole(studentId, role);
    await createStudentClassGroup({
      userId: studentId,
      classGroupId,
      academicYearId,
    });
    await createStudentSubjectEnrollment({
      userId: studentId,
      subjectId,
      academicYearId,
    });
    studentToken = signToken(studentId);

    // Same class group, but never enrolled in the subject.
    const outsiderId = await createUser({ userType: "STUDENT" });
    await assignRole(outsiderId, role);
    await createStudentClassGroup({
      userId: outsiderId,
      classGroupId,
      academicYearId,
    });
    outsiderToken = signToken(outsiderId);

    publishedNote = await makeNote("Placed on the course");
    draftItemNote = await makeNote("Placed but not published yet");

    const schemeId = await createSchemeOfWork({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId,
    });
    const [courseRes] = (await db.insert(Course).values({
      scheme_id: schemeId,
      subject_id: subjectId,
      class_group_id: classGroupId,
      academic_term_id: academicTermId,
      owner_user_id: teacherId,
      title: "Course",
      status: "PUBLISHED",
    } as any)) as any;
    courseId = courseRes.insertId as number;

    const [sectionRes] = (await db.insert(CourseSection).values({
      course_id: courseId,
      title: "Week 3 — Data Types",
      position: 1,
      status: "PUBLISHED",
    } as any)) as any;
    const sectionId = sectionRes.insertId as number;

    const [itemRes] = (await db.insert(CourseItem).values({
      section_id: sectionId,
      item_type: "LESSON_NOTE",
      ref_id: publishedNote,
      title: "Placed on the course",
      position: 1,
      is_published: 1,
      created_by: teacherId,
    } as any)) as any;
    itemId = itemRes.insertId as number;

    // Same note type, but the teacher has not published the item yet.
    await db.insert(CourseItem).values({
      section_id: sectionId,
      item_type: "LESSON_NOTE",
      ref_id: draftItemNote,
      title: "Placed but not published yet",
      position: 2,
      is_published: 0,
      created_by: teacherId,
    } as any);
  });

  const find = (rows: any[], noteId: number) =>
    rows.find((r) => r.note_id === noteId);

  it("points a member at the exact course item to open", async () => {
    const res = await library(studentToken);
    expect(res.status).toBe(200);

    expect(find(res.body.data, publishedNote).placement).toMatchObject({
      course_id: courseId,
      item_id: itemId,
      section_title: "Week 3 — Data Types",
    });
  });

  it("does not link an item the teacher has not published", async () => {
    // Linking a draft item would leak next week's material into the library.
    const res = await library(studentToken);
    expect(find(res.body.data, draftItemNote).placement).toBeNull();
  });

  it("offers no course link to someone who only received the note", async () => {
    // Sharing is far broader than course membership — being shared a note must
    // never imply a seat in the course it happens to sit on.
    const res = await library(outsiderToken);
    const row = find(res.body.data, publishedNote);
    if (row) expect(row.placement).toBeNull();
  });
});
