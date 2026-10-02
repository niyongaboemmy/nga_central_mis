/**
 * Office-hours load check (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §14.5, §20).
 * Seeds a year of office hours at school scale into a TEST database and times
 * the report queries leadership will run most.
 *
 *   600 students, 20 classes, 40 teachers, 40 schedules x 2 days x 38 weeks
 *   = 3,040 sessions and ~45,600 attendance marks.
 *
 * Usage: DB_NAME=nga_central_mis_test_oh npx ts-node --transpile-only scripts/office-hours-load.ts
 * Refuses to run against a database whose name does not contain "test".
 */
import dotenv from "dotenv";
dotenv.config();
if (!/test/.test(process.env.DB_NAME ?? "")) {
  console.error("Refusing to seed: set DB_NAME to a test database.");
  process.exit(1);
}
process.env.DB_CONNECTION_LIMIT = "5";

const main = async () => {
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { setOfficeHoursClock } = await import("../src/services/officeHours/common");
  const { resolvePeriod } = await import("../src/services/officeHours/period");
  const { summaryReport, breakdownReport, consistencyReport, coverageReport } = await import("../src/services/officeHours/reports");
  const { kigaliInstant, addDaysYmd, dowOfYmd } = await import("../src/services/reminders/time");

  const stamp = Date.now();
  const q = (s: string, ...v: any[]) => db.execute(sql.raw(s.replace(/\?/g, () => {
    const x = v.shift();
    return typeof x === "number" ? String(x) : `'${String(x).replace(/'/g, "''")}'`;
  })));
  const insertId = (r: any) => Number(r[0].insertId);

  console.log("seeding…");
  await q("UPDATE AcademicYear SET is_current = 0");
  await q("UPDATE AcademicTerm SET is_current = 0");
  const yearId = insertId(await q("INSERT INTO AcademicYear (name, start_date, end_date, is_current) VALUES (?, '2025-01-01', '2025-12-31', 1)", `LOAD ${stamp}`));
  const termId = insertId(await q("INSERT INTO AcademicTerm (academic_year_id, name, start_date, end_date, is_current) VALUES (?, 'LOAD term', '2025-01-06', '2025-12-12', 1)", yearId));
  const nextId = async (t: string, c: string) => Number(((await db.execute(sql.raw(`SELECT COALESCE(MAX(${c}),0)+1 AS n FROM ${t}`))) as any)[0][0].n);
  const programId = await nextId("Program", "program_id");
  await q("INSERT INTO Program (program_id, name) VALUES (?, ?)", programId, `LOAD P ${stamp}`);
  const gradeId = insertId(await q("INSERT INTO Grade (program_id, name, level_order) VALUES (?, ?, 1)", programId, `LOAD G ${stamp}`));
  const classIds: number[] = [];
  let cg = await nextId("ClassGroup", "class_group_id");
  for (let i = 0; i < 20; i++, cg++) {
    await q("INSERT INTO ClassGroup (class_group_id, grade_id, name) VALUES (?, ?, ?)", cg, gradeId, `LOAD C${i} ${stamp}`);
    classIds.push(cg);
  }
  const users = async (n: number, type: string) => {
    const ids: number[] = [];
    for (let i = 0; i < n; i += 200) {
      const rows = Array.from({ length: Math.min(200, n - i) }, (_, k) => `('load_${type}_${stamp}_${i + k}', 'load_${type}_${stamp}_${i + k}@example.com', 'ACTIVE')`);
      const r: any = await db.execute(sql.raw(`INSERT INTO User (username, email, status) VALUES ${rows.join(",")}`));
      const first = Number(r[0].insertId);
      for (let k = 0; k < rows.length; k++) ids.push(first + k);
    }
    for (let i = 0; i < ids.length; i += 500) {
      await db.execute(sql.raw(`INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES ${ids.slice(i, i + 500).map((id) => `(${id}, 'Load', '${type}${id}', '${type}')`).join(",")}`));
    }
    return ids;
  };
  const students = await users(600, "STUDENT");
  const teachers = await users(40, "TEACHER");
  await db.execute(sql.raw(`INSERT INTO StudentClassGroup (user_id, class_group_id, academic_year_id, status) VALUES ${students.map((s, i) => `(${s}, ${classIds[i % 20]}, ${yearId}, 'ACTIVE')`).join(",")}`));

  // 40 schedules, two days each, 15 students each (TERM lock: each student once).
  const sessionsRows: string[] = [];
  const scheduleIds: number[] = [];
  for (let t = 0; t < 40; t++) {
    const days = t % 2 === 0 ? [1, 3] : [2, 4];
    const sid = insertId(
      await q(
        "INSERT INTO OfficeHourSchedule (academic_year_id, academic_term_id, teacher_id, title, start_time, end_time, capacity, effective_from, effective_to, status) VALUES (?, ?, ?, ?, '16:20', '17:20', 15, '2025-01-06', '2025-12-12', 'ACTIVE')",
        yearId,
        termId,
        teachers[t],
        `Load support ${t}`,
      ),
    );
    scheduleIds.push(sid);
    await db.execute(sql.raw(`INSERT INTO OfficeHourScheduleDay (schedule_id, day_of_week) VALUES ${days.map((d) => `(${sid}, ${d})`).join(",")}`));
    const mine = students.slice(t * 15, t * 15 + 15);
    const r: any = await db.execute(sql.raw(`INSERT INTO OfficeHourAssignment (schedule_id, academic_term_id, student_id, status, effective_from, effective_to) VALUES ${mine.map((s) => `(${sid}, ${termId}, ${s}, 'ACTIVE', '2025-01-06', '2025-12-12')`).join(",")}`));
    const firstA = Number(r[0].insertId);
    await db.execute(sql.raw(`INSERT INTO OfficeHourStudentLock (academic_term_id, student_id, day_of_week, assignment_id) VALUES ${mine.flatMap((s, k) => [1, 2, 3, 4, 5].map((d) => `(${termId}, ${s}, ${d}, ${firstA + k})`)).join(",")}`));
    for (let ymd = "2025-01-06", w = 0; w < 38 * 7; w++, ymd = addDaysYmd(ymd, 1)) {
      if (days.includes(dowOfYmd(ymd))) sessionsRows.push(`(${sid}, ${termId}, '${ymd}', '16:20', '17:20', ${teachers[t]}, 'HELD')`);
    }
  }
  for (let i = 0; i < sessionsRows.length; i += 1000) {
    await db.execute(sql.raw(`INSERT INTO OfficeHourSession (schedule_id, academic_term_id, session_date, start_time, end_time, host_teacher_id, status) VALUES ${sessionsRows.slice(i, i + 1000).join(",")}`));
  }
  const sessions: any = await db.execute(sql.raw(`SELECT session_id, schedule_id FROM OfficeHourSession WHERE academic_term_id = ${termId}`));
  const assignments: any = await db.execute(sql.raw(`SELECT assignment_id, schedule_id, student_id FROM OfficeHourAssignment WHERE academic_term_id = ${termId}`));
  const bySchedule = new Map<number, Array<{ a: number; s: number }>>();
  for (const a of assignments[0]) bySchedule.set(Number(a.schedule_id), [...(bySchedule.get(Number(a.schedule_id)) ?? []), { a: Number(a.assignment_id), s: Number(a.student_id) }]);
  const statuses = ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "LATE", "ABSENT", "EXCUSED"];
  let marks: string[] = [];
  let total = 0;
  for (const row of sessions[0]) {
    for (const x of bySchedule.get(Number(row.schedule_id)) ?? []) {
      marks.push(`(${row.session_id}, ${x.s}, ${x.a}, '${statuses[(x.s + Number(row.session_id)) % statuses.length]}', 'TEACHER')`);
      if (marks.length >= 2000) {
        await db.execute(sql.raw(`INSERT INTO OfficeHourAttendance (session_id, student_id, assignment_id, status, source) VALUES ${marks.join(",")}`));
        total += marks.length;
        marks = [];
      }
    }
  }
  if (marks.length) {
    await db.execute(sql.raw(`INSERT INTO OfficeHourAttendance (session_id, student_id, assignment_id, status, source) VALUES ${marks.join(",")}`));
    total += marks.length;
  }
  console.log(`seeded ${sessions[0].length} sessions, ${total} marks`);

  setOfficeHoursClock(() => kigaliInstant("2025-12-12", 18 * 60));
  const leader = { userId: teachers[0], manageOwn: true, manageAny: true, view: true, viewSelf: false, configure: true };
  const time = async (label: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    await fn();
    const ms = Date.now() - t0;
    console.log(`${ms < 3000 ? "PASS" : "SLOW"}  ${label}: ${ms} ms`);
    return ms;
  };
  const year = await resolvePeriod({ period: "custom", from: "2025-01-06", to: "2025-12-12" });
  const term = await resolvePeriod({ period: "term", term_id: termId });
  const week = await resolvePeriod({ period: "week", anchor: "2025-06-11" });
  const results = [
    await time("summary, whole year", () => summaryReport(leader, year, { termId })),
    await time("summary, one week", () => summaryReport(leader, week, { termId })),
    await time("breakdown by teacher, term", () => breakdownReport(leader, term, "teacher", { termId })),
    await time("breakdown by class, term", () => breakdownReport(leader, term, "class_group", { termId })),
    await time("consistency lists, term", () => consistencyReport(leader, term, { termId })),
    await time("coverage, term", () => coverageReport(leader, termId, classIds[0])),
  ];
  process.exit(results.every((ms) => ms < 3000) ? 0 : 1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
