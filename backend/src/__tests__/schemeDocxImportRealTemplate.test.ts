import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import path from "path";
import app from "../app";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { SchemeOfWork, SchemeOfWorkEntry, SubjectCompetency } from "../db/schema";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  signToken,
} from "../test/fixtures";

// Real-world regression test: imports the actual reference DOCX the correct Scheme of Work
// template was authored from (originally "Term I Scheme of work_C_SFEPE301_2026-2027.docx"),
// checked into fixtures/ so this runs in CI, not just when a personal Downloads copy happens to
// exist. It has a cover/identification table (Sector/Trainer/Trade/...) BEFORE the weekly scheme
// table -- exactly the layout that exposed two real bugs during manual testing:
//   1. hasGroupedHeader detection only scanned the document's first 4 <tr>s, which belonged to
//      the cover table, so the real header ("Competence code and name") was never found and the
//      document silently fell through to the legacy fixed-column parser. Fixed by scanning all
//      <th> cells in the document instead.
//   2. Week 13's date range ("30/11-04/12/2026") is a cross-month day range that the same-month
//      "Format A" regex partial-matched into a backwards date (Dec 11 -> Dec 4), sorting it after
//      Week 14 in the PDF/calendar. Fixed by adding a dedicated cross-month "Format C" pattern
//      checked before Format A.
const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures",
  "scheme_of_work_grouped_header_template.docx",
);

describe("DOCX import — real reference template (grouped header)", () => {
  let token: string;
  let subjectId: number;
  let classGroupId: number;
  let academicTermId: number;

  beforeAll(async () => {
    const userId = await createUser();
    token = signToken(userId);
    subjectId = await createSubject();
    classGroupId = await createProgramGradeClassGroup();
    const period = await createAcademicPeriod();
    academicTermId = period.academicTermId;
    await createTeacherSubjectAssignment({
      userId,
      subjectId,
      classGroupId,
      academicYearId: period.academicYearId,
    });

    // Curriculum already exists for this subject, matching the document's three Learning
    // Outcomes by element_number, so competency_id should resolve during import.
    await db.insert(SubjectCompetency).values([
      {
        subject_id: subjectId,
        user_id: userId,
        element_number: 1,
        title: "Describe number systems",
        learning_hours: 15,
      },
      {
        subject_id: subjectId,
        user_id: userId,
        element_number: 2,
        title: "Describe computer programming languages",
        learning_hours: 25,
      },
      {
        subject_id: subjectId,
        user_id: userId,
        element_number: 3,
        title: "Write/Develop algorithms and flowcharts",
        learning_hours: 30,
      },
    ] as any);
  });

  it("detects the grouped header, imports every week, and resolves competency links", async () => {
    const res = await request(app)
      .post("/scheme-of-work/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("subject_id", String(subjectId))
      .field("class_group_id", String(classGroupId))
      .field("academic_term_id", String(academicTermId))
      .attach("file", FIXTURE_PATH);

    expect(res.status).toBe(200);
    expect(res.body.data.entriesCount).toBe(15);

    const [scheme] = await db
      .select()
      .from(SchemeOfWork)
      .where(eq(SchemeOfWork.scheme_id, res.body.data.schemeId))
      .limit(1);
    // The fixed-column/grouped-header parser found real rows -- no AI fallback needed.
    expect(scheme.source).toBe("DOCX_IMPORT");

    const entries = await db
      .select()
      .from(SchemeOfWorkEntry)
      .where(eq(SchemeOfWorkEntry.scheme_id, res.body.data.schemeId))
      .orderBy(SchemeOfWorkEntry.entry_id);

    expect(entries).toHaveLength(15);
    expect(entries.map((e) => e.week_number)).toEqual(
      Array.from({ length: 15 }, (_, i) => `Week ${i + 1}`),
    );

    // Week 1 belongs to LO1 ("Describe number systems") -- competency_id must resolve, and the
    // grouped-header format must NOT mis-map the LO text into `objective` (the bug this whole
    // parsing path exists to fix).
    const week1 = entries[0];
    expect(week1.competency_id).not.toBeNull();
    expect(week1.objective).toBe("");
    expect(week1.entry_status).toBe("PLANNED");
    // Indicative Content bullet structure must survive as real newlines, not be flattened.
    expect(week1.topic).toContain("\n");
    expect(week1.topic).toContain("Decimal numbers");
    expect(week1.topic).toContain("Binary numbers");
    expect(week1.methodology).toContain("Starter");
    expect(week1.resources).toContain("Whiteboard");
    expect(week1.evaluation).toContain("Exit ticket");
    expect(week1.learning_place).toBe("Classroom / Computer lab");

    // Verify the resolved competency actually points at the right Curriculum row.
    const [comp1] = await db
      .select()
      .from(SubjectCompetency)
      .where(eq(SubjectCompetency.competency_id, week1.competency_id!))
      .limit(1);
    expect(comp1.element_number).toBe(1);
    expect(comp1.title).toBe("Describe number systems");

    // Week 2 and Week 3 are still under LO1 (row-spanned in the source document) -- the
    // carry-forward logic must apply the same competency_id to them too.
    expect(entries[1].competency_id).toBe(week1.competency_id);
    expect(entries[2].competency_id).toBe(week1.competency_id);

    // Week 4 starts LO2 ("Describe computer programming languages") -- a different competency.
    const week4 = entries[3];
    expect(week4.competency_id).not.toBeNull();
    expect(week4.competency_id).not.toBe(week1.competency_id);
    const [comp2] = await db
      .select()
      .from(SubjectCompetency)
      .where(eq(SubjectCompetency.competency_id, week4.competency_id!))
      .limit(1);
    expect(comp2.element_number).toBe(2);

    // Dates parsed correctly from the "DD-DD/MM/YYYY" format used throughout this document.
    const dateOnly = (d: unknown) => new Date(d as string).toISOString().split("T")[0];
    expect(dateOnly(week1.start_date)).toBe("2026-09-07");
    expect(dateOnly(week1.end_date)).toBe("2026-09-11");
    const lastWeek = entries[14];
    expect(dateOnly(lastWeek.start_date)).toBe("2026-12-14");
    expect(dateOnly(lastWeek.end_date)).toBe("2026-12-18");

    // Week 13 uses a cross-month day-range format ("30/11-04/12/2026") that this document
    // actually contains -- found by testing against the real file. Must parse as Nov 30 -> Dec 4,
    // not be swallowed by the same-month "Format A" pattern into a backwards Dec 11 -> Dec 4.
    const week13 = entries[12];
    expect(week13.week_number).toBe("Week 13");
    expect(dateOnly(week13.start_date)).toBe("2026-11-30");
    expect(dateOnly(week13.end_date)).toBe("2026-12-04");

    // Every entry's start_date must be strictly increasing -- catches any date-parsing bug that
    // silently produces an out-of-order week (like the cross-month one above did before the fix).
    for (let i = 1; i < entries.length; i++) {
      expect(new Date(entries[i].start_date!).getTime()).toBeGreaterThan(
        new Date(entries[i - 1].start_date!).getTime(),
      );
    }
  });
});
