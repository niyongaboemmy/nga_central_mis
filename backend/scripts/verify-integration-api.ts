/**
 * End-to-end check of the /integrations sync API against real rows.
 *
 * An empty database makes these endpoints look healthy no matter what: every
 * array comes back `[]` whether the joins are right or catastrophically wrong.
 * So this seeds a small but complete fixture — a year, a programme, a grade,
 * two subjects, a class group, a teacher and a student with every link between
 * them — and then asserts the API reports it back correctly.
 *
 * The fixture is idempotent (re-running reuses the same rows) and is left in
 * place afterwards, so there is something for a partner sync to pull in dev.
 *
 * Usage (server must be running):
 *   npx ts-node scripts/verify-integration-api.ts --token=ngamis_xxx
 *   MIS_SYNC_TOKEN=ngamis_xxx npx ts-node scripts/verify-integration-api.ts
 */
import dotenv from "dotenv";
import path from "path";
import mysql from "mysql2/promise";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const argOf = (n: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};

const TOKEN = argOf("token") || process.env.MIS_SYNC_TOKEN;
const BASE = argOf("base") || `http://localhost:${process.env.PORT || 5001}`;

const YEAR = "2026 (fixture)";
const TEACHER_EMAIL = "fixture.teacher@nga.test";
const STUDENT_EMAIL = "fixture.student@nga.test";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✘ ${label}${detail !== undefined ? `\n      got: ${JSON.stringify(detail)}` : ""}`);
  }
}

async function seed(conn: mysql.Connection) {
  // Each step selects first and inserts only if missing, so the fixture is
  // stable across runs and never accumulates duplicates.
  const one = async (sql: string, params: any[] = []) => {
    const [rows] = await conn.query<any[]>(sql, params);
    return rows[0];
  };

  let year = await one("SELECT academic_year_id AS id FROM AcademicYear WHERE name = ?", [YEAR]);
  if (!year) {
    await conn.query(
      "INSERT INTO AcademicYear (name, start_date, end_date, is_current) VALUES (?, '2026-01-01', '2026-12-31', 0)",
      [YEAR],
    );
    year = await one("SELECT academic_year_id AS id FROM AcademicYear WHERE name = ?", [YEAR]);
  }

  let program = await one("SELECT program_id AS id FROM Program WHERE name = ?", ["Fixture Secondary"]);
  if (!program) {
    await conn.query("INSERT INTO Program (name, description) VALUES (?, ?)", [
      "Fixture Secondary",
      "Created by verify-integration-api.ts",
    ]);
    program = await one("SELECT program_id AS id FROM Program WHERE name = ?", ["Fixture Secondary"]);
  }

  let grade = await one("SELECT grade_id AS id FROM Grade WHERE name = ? AND program_id = ?", ["S4-FIXTURE", program.id]);
  if (!grade) {
    await conn.query("INSERT INTO Grade (program_id, name, level_order) VALUES (?, ?, 4)", [program.id, "S4-FIXTURE"]);
    grade = await one("SELECT grade_id AS id FROM Grade WHERE name = ? AND program_id = ?", ["S4-FIXTURE", program.id]);
  }

  const subjectIds: number[] = [];
  for (const [code, name] of [["FIX-MATH", "Fixture Mathematics"], ["FIX-PHY", "Fixture Physics"]]) {
    let s = await one("SELECT subject_id AS id FROM Subject WHERE code = ?", [code]);
    if (!s) {
      await conn.query("INSERT INTO Subject (code, name, description, status) VALUES (?, ?, ?, 'ACTIVE')", [code, name, "fixture"]);
      s = await one("SELECT subject_id AS id FROM Subject WHERE code = ?", [code]);
    }
    subjectIds.push(s.id);
    await conn.query("INSERT IGNORE INTO GradeSubject (grade_id, subject_id) VALUES (?, ?)", [grade.id, s.id]);
  }

  let group = await one("SELECT class_group_id AS id FROM ClassGroup WHERE name = ? AND grade_id = ?", ["S4A-FIXTURE", grade.id]);
  if (!group) {
    await conn.query("INSERT INTO ClassGroup (grade_id, name) VALUES (?, ?)", [grade.id, "S4A-FIXTURE"]);
    group = await one("SELECT class_group_id AS id FROM ClassGroup WHERE name = ? AND grade_id = ?", ["S4A-FIXTURE", grade.id]);
  }

  const roleIds: Record<string, number> = {};
  for (const rn of ["FIXTURE_TEACHER", "FIXTURE_STUDENT"]) {
    let r = await one("SELECT role_id AS id FROM Role WHERE name = ?", [rn]);
    if (!r) {
      await conn.query("INSERT INTO Role (name, description, status) VALUES (?, ?, 'ACTIVE')", [rn, "fixture"]);
      r = await one("SELECT role_id AS id FROM Role WHERE name = ?", [rn]);
    }
    roleIds[rn] = r.id;
  }

  const mkUser = async (email: string, username: string, first: string, last: string, type: string, role: string) => {
    let u = await one("SELECT user_id AS id FROM User WHERE email = ?", [email]);
    if (!u) {
      await conn.query("INSERT INTO User (username, email, phone_number, status) VALUES (?, ?, ?, 'ACTIVE')", [
        username,
        email,
        "+250788000000",
      ]);
      u = await one("SELECT user_id AS id FROM User WHERE email = ?", [email]);
    }
    await conn.query(
      "INSERT INTO UserProfile (user_id, first_name, last_name, gender, user_type) SELECT ?,?,?,?,? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM UserProfile WHERE user_id = ?)",
      [u.id, first, last, "MALE", type, u.id],
    );
    await conn.query("INSERT IGNORE INTO UserRole (user_id, role_id) VALUES (?, ?)", [u.id, roleIds[role]]);
    return u.id as number;
  };

  const teacherId = await mkUser(TEACHER_EMAIL, "fixture.teacher", "Fixture", "Teacher", "TEACHER", "FIXTURE_TEACHER");
  const studentId = await mkUser(STUDENT_EMAIL, "fixture.student", "Fixture", "Student", "STUDENT", "FIXTURE_STUDENT");

  await conn.query(
    "INSERT IGNORE INTO TeacherSubjectAssignment (user_id, subject_id, class_group_id, academic_year_id) VALUES (?,?,?,?)",
    [teacherId, subjectIds[0], group.id, year.id],
  );
  await conn.query("INSERT IGNORE INTO StudentClassGroup (user_id, class_group_id, academic_year_id) VALUES (?,?,?)", [
    studentId,
    group.id,
    year.id,
  ]);
  await conn.query("INSERT IGNORE INTO StudentSubjectEnrollment (user_id, subject_id, academic_year_id) VALUES (?,?,?)", [
    studentId,
    subjectIds[0],
    year.id,
  ]);
  await conn.query("INSERT IGNORE INTO UserGrade (user_id, grade_id, academic_year_id) VALUES (?,?,?)", [
    studentId,
    grade.id,
    year.id,
  ]);

  return { yearId: year.id, programId: program.id, gradeId: grade.id, subjectIds, groupId: group.id, teacherId, studentId };
}

async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body: any = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  if (!TOKEN) {
    console.error("Need --token=<integration token> or MIS_SYNC_TOKEN in the environment.");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  console.log("Seeding fixture...");
  const f = await seed(conn);
  console.log(`  year=${f.yearId} grade=${f.gradeId} group=${f.groupId} teacher=${f.teacherId} student=${f.studentId}\n`);

  console.log("Auth:");
  const noAuth = await fetch(`${BASE}/integrations/ping`);
  check("rejects a request with no token (401)", noAuth.status === 401, noAuth.status);
  const badAuth = await fetch(`${BASE}/integrations/ping`, { headers: { Authorization: "Bearer ngamis_wrong" } });
  check("rejects an unknown token (401)", badAuth.status === 401, badAuth.status);

  console.log("\n/integrations/ping:");
  const ping = await get(`${BASE}/integrations/ping`);
  check("200", ping.status === 200, ping.status);
  check("counts.users reflects seeded users", (ping.body?.data?.counts?.users ?? 0) >= 2, ping.body?.data?.counts);
  check("counts.subjects reflects seeded subjects", (ping.body?.data?.counts?.subjects ?? 0) >= 2, ping.body?.data?.counts);
  check("declares schoolFilter=instance", ping.body?.data?.scope?.schoolFilter === "instance", ping.body?.data?.scope);

  console.log("\n/integrations/sync/reference:");
  const ref = await get(`${BASE}/integrations/sync/reference`);
  const d = ref.body?.data;
  check("200", ref.status === 200, ref.status);
  check("returns the seeded academic year", d?.academicYears?.some((y: any) => y.id === f.yearId), d?.academicYears?.length);
  check("returns the seeded programme", d?.programs?.some((p: any) => p.id === f.programId), d?.programs?.length);
  check("grade is linked to its programme", d?.grades?.some((g: any) => g.id === f.gradeId && g.programId === f.programId), d?.grades);
  check("returns both seeded subjects", f.subjectIds.every((id) => d?.subjects?.some((s: any) => s.id === id)), d?.subjects?.length);
  check("gradeSubjects links both subjects to the grade",
    f.subjectIds.every((id) => d?.gradeSubjects?.some((gs: any) => gs.gradeId === f.gradeId && gs.subjectId === id)),
    d?.gradeSubjects?.length);
  check("class group is linked to its grade", d?.classGroups?.some((c: any) => c.id === f.groupId && c.gradeId === f.gradeId), d?.classGroups);
  check("returns roles", (d?.roles?.length ?? 0) >= 2, d?.roles?.length);
  check("declares delta unsupported", d?.delta?.supported === false, d?.delta);

  console.log("\n/integrations/sync/people:");
  const ppl = await get(`${BASE}/integrations/sync/people?limit=500`);
  const users = ppl.body?.data?.users ?? [];
  const student = users.find((u: any) => u.email === STUDENT_EMAIL);
  const teacher = users.find((u: any) => u.email === TEACHER_EMAIL);
  check("200", ppl.status === 200, ppl.status);
  check("student is present", !!student);
  check("teacher is present", !!teacher);
  check("student profile is joined (name + type)",
    student?.profile?.fullName === "Fixture Student" && student?.profile?.userType === "STUDENT",
    student?.profile);
  check("student has exactly their own role", student?.roles?.length === 1 && student?.roles[0]?.name === "FIXTURE_STUDENT", student?.roles);
  check("student class-group membership attached", student?.classGroups?.some((c: any) => c.classGroupId === f.groupId), student?.classGroups);
  check("student subject enrolment attached", student?.subjectEnrollments?.some((s: any) => s.subjectId === f.subjectIds[0]), student?.subjectEnrollments);
  check("student grade assignment attached", student?.gradeAssignments?.some((g: any) => g.gradeId === f.gradeId), student?.gradeAssignments);
  check("teacher assignment attached to the TEACHER, not the student",
    teacher?.teachingAssignments?.some((t: any) => t.subjectId === f.subjectIds[0] && t.classGroupId === f.groupId) &&
      (student?.teachingAssignments?.length ?? 0) === 0,
    { teacher: teacher?.teachingAssignments, student: student?.teachingAssignments });

  console.log("\nKeyset pagination:");
  const p1 = await get(`${BASE}/integrations/sync/people?limit=1`);
  const first = p1.body?.data;
  check("limit is honoured", first?.users?.length === 1, first?.users?.length);
  check("reports hasMore with a cursor", first?.pagination?.hasMore === true && first?.pagination?.nextCursor != null, first?.pagination);
  const p2 = await get(`${BASE}/integrations/sync/people?limit=1&cursor=${first?.pagination?.nextCursor}`);
  const second = p2.body?.data;
  check("cursor advances to a different user",
    second?.users?.length === 1 && second.users[0].id !== first.users[0].id && second.users[0].id > first.users[0].id,
    { first: first?.users?.[0]?.id, second: second?.users?.[0]?.id });

  console.log("\nDelta filter:");
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const none = await get(`${BASE}/integrations/sync/people?since=${encodeURIComponent(future)}`);
  check("a future `since` returns nobody", (none.body?.data?.users?.length ?? -1) === 0, none.body?.data?.users?.length);
  const past = await get(`${BASE}/integrations/sync/people?since=2000-01-01T00:00:00Z`);
  check("an old `since` returns everybody", (past.body?.data?.users?.length ?? 0) >= 2, past.body?.data?.users?.length);
  const bad = await fetch(`${BASE}/integrations/sync/people?since=not-a-date`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  check("rejects a malformed `since` (400)", bad.status === 400, bad.status);

  console.log(`\n${"-".repeat(60)}`);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) for (const f2 of failures) console.log(`  ✘ ${f2}`);

  await conn.end();
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
