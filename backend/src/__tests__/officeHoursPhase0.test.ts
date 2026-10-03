import { describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  OfficeHourSetting,
  OfficeHourSchedule,
  OfficeHourScheduleDay,
  OfficeHourSession,
  SchoolClosure,
} from "../db/officeHoursSchema";
import { MIS_MANIFEST } from "../access/manifest";
import { PRESETS } from "../access/presets";
import { isV2OnlyCapability } from "../access/v2Only";
import { ALL_PERMISSIONS } from "../utils/permissions";
import { createAcademicPeriod, createUser } from "../test/fixtures";

// Office hours Phase 0 (migration 102): the Drizzle mirror matches the SQL,
// the settings row exists, and the capabilities are declared where Access
// Studio, the SUPER_ADMIN catalog and the presets expect them.
const CAPS = [
  "OFFICE_HOURS_MANAGE_OWN",
  "OFFICE_HOURS_MANAGE_ANY",
  "OFFICE_HOURS_VIEW",
  "OFFICE_HOURS_VIEW_SELF",
  "OFFICE_HOURS_CONFIGURE",
];

describe("Office hours phase 0: schema and capabilities", () => {
  it("has the single settings row with the plan's defaults", async () => {
    const [row] = await db.select().from(OfficeHourSetting).where(eq(OfficeHourSetting.id, 1));
    expect(row).toBeTruthy();
    expect(row.student_lock_mode).toBe("TERM");
    expect(row.band_start).toBe("16:20");
    expect(row.band_end).toBe("17:20");
    expect(row.rate_band_watch).toBe(80);
    expect(row.parent_notifications).toBe("ESCALATIONS");
  });

  it("round-trips a schedule, its days and a dated session through Drizzle", async () => {
    const { academicYearId, academicTermId } = await createAcademicPeriod();
    const teacherId = await createUser({ userType: "TEACHER" });
    const [res] = (await db.insert(OfficeHourSchedule).values({
      academic_year_id: academicYearId,
      academic_term_id: academicTermId,
      teacher_id: teacherId,
      title: "Maths support",
      start_time: "16:20",
      end_time: "17:20",
      effective_from: "2026-03-02",
      effective_to: "2026-06-26",
    })) as any;
    const scheduleId = res.insertId as number;
    await db.insert(OfficeHourScheduleDay).values([
      { schedule_id: scheduleId, day_of_week: 1 },
      { schedule_id: scheduleId, day_of_week: 3 },
    ]);
    await db.insert(OfficeHourSession).values({
      schedule_id: scheduleId,
      academic_term_id: academicTermId,
      session_date: "2026-03-02",
      start_time: "16:20",
      end_time: "17:20",
      host_teacher_id: teacherId,
    });

    const [schedule] = await db.select().from(OfficeHourSchedule).where(eq(OfficeHourSchedule.schedule_id, scheduleId));
    // DATE columns come back as the same Kigali date string, never shifted by the host zone.
    expect(schedule.effective_from).toBe("2026-03-02");
    expect(schedule.status).toBe("ACTIVE");
    const days = await db.select().from(OfficeHourScheduleDay).where(eq(OfficeHourScheduleDay.schedule_id, scheduleId));
    expect(days.map((d) => d.day_of_week).sort()).toEqual([1, 3]);
    const [session] = await db.select().from(OfficeHourSession).where(eq(OfficeHourSession.schedule_id, scheduleId));
    expect(session.session_date).toBe("2026-03-02");
    expect(session.status).toBe("SCHEDULED");

    // A second session on the same date for the same schedule is refused.
    await expect(
      db.insert(OfficeHourSession).values({
        schedule_id: scheduleId,
        academic_term_id: academicTermId,
        session_date: "2026-03-02",
        start_time: "16:20",
        end_time: "17:20",
        host_teacher_id: teacherId,
      }),
    ).rejects.toThrow();
  });

  it("stores closures as plain dates", async () => {
    const [res] = (await db.insert(SchoolClosure).values({
      start_date: "2026-04-06",
      end_date: "2026-04-10",
      reason: "Mid-term break",
    })) as any;
    const [row] = await db.select().from(SchoolClosure).where(eq(SchoolClosure.closure_id, res.insertId));
    expect(row.start_date).toBe("2026-04-06");
    expect(row.scope).toBe("ALL");
    await db.execute(sql`DELETE FROM SchoolClosure WHERE closure_id = ${res.insertId}`);
  });

  it("declares every capability in the manifest, legacy-visible and keyword-free", () => {
    const KEYWORDS = ["MANAGE_USER", "MANAGE_ROLE", "MANAGE_STAFF", "MANAGE_SYSTEM", "MANAGE_SCHOOL", "ADMIN", "STUDENT", "VIEW_ATTENDANCE", "TEACHER"];
    for (const cap of CAPS) {
      expect((MIS_MANIFEST.capabilities as Record<string, unknown>)[cap], cap).toBeTruthy();
      // Teachers, students and parents reach office hours through legacy roles.
      expect(isV2OnlyCapability(cap)).toBe(false);
      // SUPER_ADMIN's code catalog must include it.
      expect(ALL_PERMISSIONS).toContain(cap);
      // Spoke apps keyword-match the legacy permission list.
      expect(KEYWORDS.some((k) => cap.includes(k)), cap).toBe(false);
    }
  });

  it("puts the capabilities on the presets the plan names", () => {
    const capsOf = (key: string) =>
      (PRESETS.find((p) => p.key === key)?.caps ?? []).map((c) => (Array.isArray(c) ? c[0] : c));
    expect(capsOf("teaching_staff")).toContain("OFFICE_HOURS_MANAGE_OWN");
    expect(capsOf("class_teacher")).toEqual(expect.arrayContaining(["OFFICE_HOURS_MANAGE_OWN", "OFFICE_HOURS_VIEW"]));
    expect(capsOf("head_teacher")).toEqual(expect.arrayContaining(["OFFICE_HOURS_MANAGE_ANY", "OFFICE_HOURS_VIEW", "OFFICE_HOURS_CONFIGURE"]));
    expect(capsOf("student")).toContain("OFFICE_HOURS_VIEW_SELF");
    expect(capsOf("parent")).toContain("OFFICE_HOURS_VIEW_SELF");
    // Administrators get aggregates only.
    const admin = PRESETS.find((p) => p.key === "school_administrator")!.caps;
    expect(admin).toContainEqual(["OFFICE_HOURS_VIEW", "summary"]);
  });
});
