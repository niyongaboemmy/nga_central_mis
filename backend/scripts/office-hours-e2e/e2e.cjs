/* End-to-end check of mandatory office hours in a real Chrome (OFFICE_HOURS_IMPLEMENTATION_PLAN.md).
 *
 * Needs, already running:
 *   API  (E2E_API, default http://localhost:5081) on the test database E2E_DB
 *        with OFFICE_HOURS_FAKE_NOW pinned inside today's 16:20-17:20 band
 *   app  (E2E_APP, default http://localhost:5184) = vite pointing at that API
 * Seeds its own school (term, class, subject, two teachers, a leader, students),
 * then drives: create office hours from the hub, pick students, publish; a
 * second teacher sees the student is taken; take the register; the student's
 * page and timetable band; leadership closures/settings; an axe audit in two
 * themes. Screenshots go to the out dir.
 *
 * Usage: node scripts/office-hours-e2e/e2e.cjs [outDir]
 */
const path = require("path");
const fs = require("fs");
const B = path.resolve(__dirname, "../..");
require(path.join(B, "node_modules/dotenv")).config({ path: path.join(B, ".env") });
const jwt = require(path.join(B, "node_modules/jsonwebtoken"));
const mysql = require(path.join(B, "node_modules/mysql2/promise"));
const puppeteer = require(path.join(B, "node_modules/puppeteer"));
let AXE = null;
try {
  AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js", { paths: [__dirname, path.join(B, "scripts/reminders-e2e"), B] }), "utf8");
} catch {
  AXE = null;
}

const API = process.env.E2E_API || "http://localhost:5081";
const APP = process.env.E2E_APP || "http://localhost:5184";
const DB = process.env.E2E_DB || "nga_central_mis_test_oh";
const OUT = process.argv[2] || path.join(__dirname, "out");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 8889),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: DB,
  });
  const cfg = await fetch(`${API}/`).then((r) => r.json()).catch(() => null);
  if (!cfg) throw new Error(`API not reachable at ${API}`);

  // ─── seed ──────────────────────────────────────────────────────────────────
  const stamp = Date.now();
  const today = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10); // Kigali date
  await db.query("UPDATE AcademicYear SET is_current = 0");
  await db.query("UPDATE AcademicTerm SET is_current = 0");
  const year = Number(today.slice(0, 4));
  const [y] = await db.query("INSERT INTO AcademicYear (name, start_date, end_date, is_current) VALUES (?, ?, ?, 1)", [`E2E ${stamp}`, `${year}-01-01`, `${year}-12-31`]);
  const [t] = await db.query("INSERT INTO AcademicTerm (academic_year_id, name, start_date, end_date, is_current) VALUES (?, 'Term E2E', ?, ?, 1)", [y.insertId, `${year}-01-05`, `${year}-12-18`]);
  const yearId = y.insertId;
  const termId = t.insertId;
  const next = async (table, col) => (await db.query(`SELECT COALESCE(MAX(${col}),0)+1 AS n FROM ${table}`))[0][0].n;
  const programId = await next("Program", "program_id");
  await db.query("INSERT INTO Program (program_id, name) VALUES (?, ?)", [programId, `E2E Program ${stamp}`]);
  const [g] = await db.query("INSERT INTO Grade (program_id, name, level_order) VALUES (?, ?, 1)", [programId, `E2E Grade ${stamp}`]);
  const classGroupId = await next("ClassGroup", "class_group_id");
  await db.query("INSERT INTO ClassGroup (class_group_id, grade_id, name) VALUES (?, ?, ?)", [classGroupId, g.insertId, `S4 MPC ${String(stamp).slice(-4)}`]);
  const [subj] = await db.query("INSERT INTO Subject (code, name, color) VALUES (?, 'Mathematics E2E', '#2563eb')", [`MATE2E${String(stamp).slice(-6)}`]);
  const [subj2] = await db.query("INSERT INTO Subject (code, name, color) VALUES (?, 'Physics E2E', '#16a34a')", [`PHYE2E${String(stamp).slice(-6)}`]);

  const permId = async (name) => {
    const [[p]] = await db.query("SELECT perm_id FROM Permission WHERE name=? LIMIT 1", [name]);
    if (p) return p.perm_id;
    const [ins] = await db.query("INSERT INTO Permission (name, status) VALUES (?, 'ACTIVE')", [name]);
    return ins.insertId;
  };
  const role = async (label, perms) => {
    const id = await next("Role", "role_id");
    await db.query("INSERT INTO Role (role_id, name, status) VALUES (?, ?, 'ACTIVE')", [id, `${label}_${stamp}`]);
    for (const p of perms) await db.query("INSERT INTO RolePermission (role_id, perm_id) VALUES (?, ?)", [id, await permId(p)]);
    return id;
  };
  const teacherRole = await role("E2E_OH_TEACHER", ["OFFICE_HOURS_MANAGE_OWN", "TEACHER_DASHBOARD", "VIEW_MY_CALENDAR", "VIEW_MY_ASSIGNED_SUBJECTS"]);
  const studentRole = await role("E2E_OH_STUDENT", ["OFFICE_HOURS_VIEW_SELF", "VIEW_STUDENT_CALENDAR"]);
  const leaderRole = await role("E2E_OH_LEADER", ["OFFICE_HOURS_MANAGE_ANY", "OFFICE_HOURS_VIEW", "OFFICE_HOURS_CONFIGURE"]);
  const person = async (first, last, type, roleId) => {
    const [u] = await db.query("INSERT INTO User (username, email, status) VALUES (?, ?, 'ACTIVE')", [`oh_${first}_${stamp}`, `oh_${first}_${stamp}@example.com`]);
    await db.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, ?, ?, ?)", [u.insertId, first, last, type]);
    await db.query("INSERT INTO UserRole (user_id, role_id) VALUES (?, ?)", [u.insertId, roleId]);
    return u.insertId;
  };
  const teacherA = await person("Alice", "Uwimana", "TEACHER", teacherRole);
  const teacherB = await person("Ben", "Habimana", "TEACHER", teacherRole);
  const leader = await person("Grace", "Head", "ADMIN", leaderRole);
  const students = [];
  for (const [f, l] of [["Aline", "Mukamana"], ["Bruno", "Nkusi"], ["Chantal", "Iradukunda"], ["David", "Mugabo"]]) {
    const id = await person(f, l, "STUDENT", studentRole);
    await db.query("INSERT INTO StudentClassGroup (user_id, class_group_id, academic_year_id, status) VALUES (?, ?, ?, 'ACTIVE')", [id, classGroupId, yearId]);
    students.push(id);
  }
  await db.query("INSERT INTO TeacherSubjectAssignment (user_id, subject_id, class_group_id, academic_year_id) VALUES (?, ?, ?, ?)", [teacherA, subj.insertId, classGroupId, yearId]);
  await db.query("INSERT INTO TeacherSubjectAssignment (user_id, subject_id, class_group_id, academic_year_id) VALUES (?, ?, ?, ?)", [teacherB, subj2.insertId, classGroupId, yearId]);
  // The server clock sits inside today's band (after the 14:00 same-day cut-off), so
  // students added now would start next week. Move the cut-off for this run.
  const tokenOf = (userId) => jwt.sign({ userId, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "2h" });
  // Through the API, so the server's settings cache is refreshed too.
  const putSettings = (body) =>
    fetch(`${API}/office-hours/settings`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOf(leader)}` }, body: JSON.stringify(body) }).then((r) => r.status);
  const [[setting]] = await db.query("SELECT roster_cutoff_time FROM OfficeHourSetting WHERE id = 1");
  check("cut-off moved for the run", (await putSettings({ roster_cutoff_time: "17:30" })) === 200);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 1..5 on a weekday
  check("today is a weekday (the band only runs Mon-Fri)", dow >= 1 && dow <= 5, today);

  // ─── browser ───────────────────────────────────────────────────────────────
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ["--no-sandbox"] });
  const errors = [];
  const open = async (token, theme = "light") => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/favicon|React Router|DevTools|Failed to load resource|401|403|ERR_/.test(m.text()) && errors.push(m.text()));
    await page.setViewport({ width: 1366, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36");
    await page.evaluateOnNewDocument(
      (tk, th) => {
        localStorage.setItem("token", tk);
        localStorage.setItem("theme", th);
        sessionStorage.setItem("nga.pwa.autoPromptDismissedThisSession", "1");
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      },
      token,
      theme,
    );
    return page;
  };
  const text = (page) => page.evaluate(() => document.body.innerText);
  const waitText = async (page, needle, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const t = await text(page).catch(() => "");
      // innerText applies CSS text-transform, so compare case-insensitively.
      if (typeof needle === "string" ? t.toLowerCase().includes(needle.toLowerCase()) : needle.test(t)) return true;
      await sleep(300);
    }
    return false;
  };
  const clickText = async (page, selector, label) => {
    const ok = await page.evaluate(
      (s, l) => {
        const el = [...document.querySelectorAll(s)].find((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().startsWith(l) && e.offsetParent !== null && !e.disabled);
        if (!el) return false;
        el.click();
        return true;
      },
      selector,
      label,
    );
    if (!ok) throw new Error(`No clickable ${selector} "${label}"`);
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  const axe = async (page, name) => {
    if (!AXE) return;
    await sleep(500); // let colour transitions finish
    await page.evaluate(AXE);
    const r = await page.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" "), why: v.nodes[0]?.any?.[0]?.message }));
    });
    const serious = r.filter((v) => v.impact === "serious" || v.impact === "critical");
    check(`axe: no serious violations on ${name}`, serious.length === 0, serious);
  };

  try {
    // 1) Teacher A creates office hours today and assigns two students.
    const a = await open(tokenOf(teacherA));
    await a.goto(`${APP}/office-hours`, { waitUntil: "networkidle2" });
    check("teacher hub loads", await waitText(a, "Office hours"));
    await clickText(a, "button", "New office hours");
    await waitText(a, "New office hours · 1 of 3");
    const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    await clickText(a, "button", dayNames[dow]);
    await a.select("#oh-subject", String(subj.insertId)).catch(() => undefined);
    await a.type("#oh-room", "B4");
    await shot(a, "01-create-details");
    await clickText(a, "button", "Continue to students");
    check("draft saved, picker opens", await waitText(a, "Choose students · 2 of 3"));
    await waitText(a, "Aline Mukamana");
    await a.click(`#oh-pick-${students[0]}`);
    await a.click(`#oh-pick-${students[1]}`);
    await a.select("#oh-reason", "BELOW_STANDARD");
    await shot(a, "02-picker");
    await clickText(a, "button", "Assign 2 students");
    const todayLabel = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
    check("two students assigned, starting today", await waitText(a, `2 assigned, starting ${todayLabel}`), todayLabel);
    await clickText(a, "button", "Review");
    await clickText(a, "button", "Publish");
    check("published and on the detail page", await waitText(a, /Published/));
    await waitText(a, "Aline Mukamana");
    await shot(a, "03-detail");
    const [[sched]] = await db.query("SELECT schedule_id, status FROM OfficeHourSchedule WHERE teacher_id=? ORDER BY schedule_id DESC LIMIT 1", [teacherA]);
    check("schedule is ACTIVE in the database", sched && sched.status === "ACTIVE", sched);
    await axe(a, "schedule detail (light)");

    // 2) Teacher B sees the student is taken.
    const b = await open(tokenOf(teacherB));
    await b.goto(`${APP}/office-hours?new=1&day=${dow}`, { waitUntil: "networkidle2" });
    check("+ deep link opens the drawer with the day preselected", await waitText(b, "New office hours · 1 of 3"));
    await clickText(b, "button", "Continue to students");
    await waitText(b, "Aline Mukamana");
    check("picker shows Aline is with teacher A", await waitText(b, /With Alice Uwimana/));
    const disabled = await b.$eval(`#oh-pick-${students[0]}`, (el) => el.disabled);
    check("taken student cannot be ticked", disabled === true);
    await shot(b, "04-picker-taken");
    await b.close();

    // 3) Teacher A takes the register (server clock pinned inside the band).
    await a.goto(`${APP}/office-hours`, { waitUntil: "networkidle2" });
    check("today's session is on the hub", await waitText(a, "Take register"));
    await clickText(a, "button", "Take register");
    await waitText(a, "Mark all present");
    await clickText(a, "button", "Mark all present");
    await a.evaluate(() => {
      const group = [...document.querySelectorAll('[role="radiogroup"]')].find((g) => g.getAttribute("aria-label")?.includes("Bruno"));
      [...group.querySelectorAll('[role="radio"]')].find((r) => r.textContent.includes("Absent")).click();
    });
    await shot(a, "05-register");
    await axe(a, "register (light)");
    await clickText(a, "button", "Save register");
    check("register saved", await waitText(a, "Register saved"));
    const [marks] = await db.query(
      "SELECT a.student_id, a.status FROM OfficeHourAttendance a JOIN OfficeHourSession s ON s.session_id=a.session_id WHERE s.schedule_id=? ORDER BY a.student_id",
      [sched.schedule_id],
    );
    check("marks stored: Aline present, Bruno absent", JSON.stringify(marks.map((m) => m.status)) === JSON.stringify(["PRESENT", "ABSENT"]), marks);
    await a.goto(`${APP}/dashboard`, { waitUntil: "networkidle2" });
    check("teacher timetable band shows the office hours", await waitText(a, /2 students · B4|Mathematics E2E support/, 20000));
    await shot(a, "06-teacher-timetable");
    await a.close();

    // 4) The student sees their office hours and their mark.
    const s = await open(tokenOf(students[0]));
    await s.goto(`${APP}/my-office-hours`, { waitUntil: "networkidle2" });
    check("student page shows the assignment with the teacher", await waitText(s, /with Alice Uwimana/));
    check("student history shows Present", await waitText(s, "Present"));
    const studentText = await text(s);
    check("student never sees the reason code", !/below standard/i.test(studentText));
    await shot(s, "07-student");
    await axe(s, "my office hours (light)");
    await s.close();

    // 5) Leadership: closures and settings, dark theme audit.
    // ThemeContext takes User.preferred_theme over localStorage.
    await db.query("UPDATE User SET preferred_theme='dark' WHERE user_id=?", [leader]);
    const l = await open(tokenOf(leader), "dark");
    await l.goto(`${APP}/office-hours/admin?tab=closures`, { waitUntil: "networkidle2" });
    check("oversight closures tab loads", await waitText(l, "School closures"));
    await shot(l, "08-admin-closures-dark");
    await axe(l, "oversight closures (dark)");
    await l.goto(`${APP}/office-hours/admin?tab=settings`, { waitUntil: "networkidle2" });
    check("settings tab loads", await waitText(l, "One office hours per student"));
    await axe(l, "oversight settings (dark)");
    await l.goto(`${APP}/office-hours/admin?tab=unmarked`, { waitUntil: "networkidle2" });
    check("missing-registers tab loads", await waitText(l, /Registers not taken|Every register is taken/));
    await l.close();

    // Mobile layout: no horizontal scroll on the hub.
    const m = await open(tokenOf(teacherA));
    await m.setViewport({ width: 390, height: 844 });
    await m.goto(`${APP}/office-hours`, { waitUntil: "networkidle2" });
    await waitText(m, "Office hours");
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("hub fits a phone screen", overflow <= 1, overflow);
    await shot(m, "09-mobile-hub");
    await m.close();
  } catch (error) {
    check("flow completed", false, error.message);
    for (const p of await browser.pages()) {
      await p.screenshot({ path: path.join(OUT, `zz-failure-${Date.now()}.png`), fullPage: true }).catch(() => undefined);
      console.log("--- page text at failure ---\n" + (await p.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 1500));
    }
  } finally {
    check("no page errors", errors.length === 0, errors.slice(0, 5));
    await browser.close();
    await putSettings({ roster_cutoff_time: setting?.roster_cutoff_time ?? "14:00" });
    await db.end();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${OUT}`);
    process.exit(failed ? 1 : 0);
  }
})();
