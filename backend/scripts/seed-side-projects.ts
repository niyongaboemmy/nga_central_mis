/**
 * Demo data for student side projects (STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md §4.5).
 * Local and test databases only — refuses to run with NODE_ENV=production.
 *
 *   npx ts-node --transpile-only scripts/seed-side-projects.ts            # projects for existing students
 *   npx ts-node --transpile-only scripts/seed-side-projects.ts --fixtures # also a demo year, classes, students, staff
 *
 * Prints the demo accounts (user ids) at the end. Every project goes through the real
 * services, so validation, snapshots, files and events are exactly what the app writes.
 */
import dotenv from "dotenv";
dotenv.config();
import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { createProject, moveProject } from "../src/services/sideProjects/projects";
import { accessProject } from "../src/services/sideProjects/access";
import { addMedia, storeProjectFiles } from "../src/services/sideProjects/files";
import { addMilestone, addUpdate, updateMilestone } from "../src/services/sideProjects/progress";
import { review } from "../src/services/sideProjects/review";
import { many, one, insertId } from "../src/services/sideProjects/core";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo projects in production.");
  process.exit(1);
}

const FIRST = ["Aline", "Eric", "Grace", "Kevin", "Diane", "Patrick", "Sandrine", "Yves", "Claudine", "Olivier", "Brenda", "Jean"];
const LAST = ["Uwase", "Mugisha", "Ishimwe", "Habimana", "Ingabire", "Niyonzima", "Umutoni", "Nshuti", "Mukamana", "Hakizimana", "Iradukunda", "Bizimana"];

const PROJECTS: Array<{ title: string; cat: string; tags: string[]; problem: string; status: "IDEA" | "IN_PROGRESS" | "COMPLETED"; github?: string; live?: string; color: [number, number, number]; stale?: boolean; verified?: boolean; changes?: boolean; blocked?: boolean }> = [
  { title: "Smart irrigation controller", cat: "iot", tags: ["Arduino", "C++", "Sensors"], status: "COMPLETED", github: "https://github.com/nga-demo/smart-irrigation", color: [16, 150, 110], verified: true, problem: "School gardens waste water because nobody can see the soil moisture in real time, so plants are over- or under-watered." },
  { title: "Campus lost & found", cat: "web", tags: ["React", "Node.js", "MySQL"], status: "IN_PROGRESS", github: "https://github.com/nga-demo/lost-found", color: [42, 120, 214], problem: "Students lose items on campus every week and there is no single place to report or find them, so most are never returned." },
  { title: "Kinyarwanda flashcards app", cat: "mobile", tags: ["Flutter", "Dart"], status: "IN_PROGRESS", color: [20, 184, 166], changes: true, problem: "Younger pupils struggle to learn new Kinyarwanda vocabulary at home because there are no offline practice tools on cheap phones." },
  { title: "Canteen queue predictor", cat: "ai", tags: ["Python", "scikit-learn"], status: "IDEA", color: [236, 72, 153], problem: "Lunch queues waste up to twenty minutes of break time because students cannot tell when the canteen is least busy." },
  { title: "Line-following robot", cat: "robotics", tags: ["Arduino", "Motors"], status: "IN_PROGRESS", color: [227, 73, 72], stale: true, problem: "The robotics club has no shared kit to teach control loops, so beginners never get hands-on practice with sensors and motors." },
  { title: "Math puzzle game", cat: "game", tags: ["Godot", "GDScript"], status: "COMPLETED", live: "https://nga-demo.itch.io/math-puzzles", color: [27, 175, 122], problem: "Many students see mental arithmetic as boring and avoid practising it, which hurts their speed in exams." },
  { title: "Attendance heat map", cat: "data", tags: ["Python", "Pandas", "Plotly"], status: "IDEA", color: [37, 99, 235], problem: "Class teachers only notice attendance patterns weeks later because the registers are not visualised anywhere." },
  { title: "Phishing awareness quiz", cat: "security", tags: ["JavaScript", "HTML"], status: "IN_PROGRESS", color: [100, 116, 139], blocked: true, problem: "Staff and students click suspicious links in emails because they have never practised spotting phishing messages." },
  { title: "Library QR finder", cat: "web", tags: ["Vue", "Firebase"], status: "IDEA", color: [59, 108, 255], problem: "Finding a book in the school library takes too long because the shelves are not indexed and the catalogue is on paper." },
  { title: "Solar charging kiosk", cat: "iot", tags: ["ESP32", "Solar"], status: "IN_PROGRESS", github: "https://github.com/nga-demo/solar-kiosk", color: [237, 161, 0], problem: "Students who board cannot charge their devices during power cuts, which interrupts their study time in the evening." },
  { title: "Peer tutoring matcher", cat: "web", tags: ["Next.js", "Postgres"], status: "COMPLETED", github: "https://github.com/nga-demo/peer-tutor", live: "https://peer-tutor.example.org", color: [42, 120, 214], problem: "Students who need help in a subject rarely find a classmate who is strong in it, even though many would happily help." },
  { title: "Bus arrival tracker", cat: "mobile", tags: ["Kotlin", "GPS"], status: "IDEA", color: [29, 78, 216], problem: "Day students wait at the bus stop without knowing when the school bus will arrive, sometimes for more than half an hour." },
];

function pdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

async function tmp(name: string, buf: Buffer) {
  const p = path.join(os.tmpdir(), `sp-seed-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
  await fsp.writeFile(p, buf);
  return { path: p, originalname: name, size: buf.length };
}

async function cover([r, g, b]: [number, number, number], label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(${r},${g},${b})"/><stop offset="1" stop-color="rgb(${Math.max(0, r - 60)},${Math.max(0, g - 60)},${Math.min(255, b + 40)})"/></linearGradient></defs>
    <rect width="1200" height="700" fill="url(#g)"/>
    <circle cx="980" cy="160" r="220" fill="white" fill-opacity="0.08"/><circle cx="200" cy="600" r="160" fill="white" fill-opacity="0.06"/>
    <rect x="120" y="230" width="560" height="300" rx="24" fill="white" fill-opacity="0.15"/>
    <text x="150" y="330" font-family="Helvetica, Arial" font-size="54" font-weight="700" fill="white">${label.replace(/&/g, "&amp;")}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function nextId(table: string, col: string) {
  const r = await one(sql.raw(`SELECT COALESCE(MAX(\`${col}\`), 0) + 1 AS n FROM \`${table}\``));
  return Number(r.n);
}

async function fixtures() {
  await db.execute(sql`UPDATE AcademicYear SET is_current = 0`);
  const y = insertId(await db.execute(sql`INSERT INTO AcademicYear (name, start_date, end_date, is_current) VALUES ('2026-2027', '2026-09-01', '2027-07-31', 1)`));
  await db.execute(sql`UPDATE AcademicTerm SET is_current = 0`);
  await db.execute(sql`INSERT INTO AcademicTerm (academic_year_id, name, start_date, end_date, is_current) VALUES (${y}, 'Term 1', '2026-09-01', '2026-12-20', 1)`);
  const prog = await nextId("Program", "program_id");
  await db.execute(sql`INSERT INTO Program (program_id, name) VALUES (${prog}, ${`Software Development ${prog}`})`);
  const classes: number[] = [];
  for (const [i, lvl] of ["L3", "L4", "L5"].entries()) {
    const g = insertId(await db.execute(sql`INSERT INTO Grade (program_id, name, level_order) VALUES (${prog}, ${lvl}, ${i + 3})`));
    const c = await nextId("ClassGroup", "class_group_id");
    await db.execute(sql`INSERT INTO ClassGroup (class_group_id, grade_id, name) VALUES (${c}, ${g}, ${`${lvl} SOD`})`);
    classes.push(c);
  }
  const mk = async (first: string, last: string, type: string, reg: string | null) => {
    const uname = `${first}.${last}.${Date.now() % 100000}${Math.floor(Math.random() * 99)}`.toLowerCase();
    const id = insertId(await db.execute(sql`INSERT INTO User (username, email, status) VALUES (${uname}, ${`${uname}@demo.local`}, 'ACTIVE')`));
    await db.execute(sql`INSERT INTO UserProfile (user_id, first_name, last_name, user_type, registration_number) VALUES (${id}, ${first}, ${last}, ${type}, ${reg})`);
    return id;
  };
  const students: number[] = [];
  for (let i = 0; i < FIRST.length; i++) {
    const id = await mk(FIRST[i], LAST[i], "STUDENT", `2026SOD${String(100 + i).padStart(4, "0")}`);
    await db.execute(sql`INSERT INTO StudentClassGroup (user_id, class_group_id, academic_year_id, status) VALUES (${id}, ${classes[i % 3]}, ${y}, 'ACTIVE')`);
    const stu = await one(sql`SELECT role_id FROM Role WHERE name = 'STUDENT' LIMIT 1`);
    if (stu) await db.execute(sql`INSERT INTO UserRole (user_id, role_id) VALUES (${id}, ${stu.role_id})`);
    students.push(id);
  }
  const lead = await mk("Projects", "Lead", "ADMIN", null);
  const admin = await one(sql`SELECT role_id FROM Role WHERE name = 'SUPER_ADMIN' LIMIT 1`);
  if (admin) await db.execute(sql`INSERT INTO UserRole (user_id, role_id) VALUES (${lead}, ${admin.role_id})`);
  const teacher = await mk("Marie", "Teacher", "TEACHER", null);
  const t = await one(sql`SELECT role_id FROM Role WHERE name = 'TEACHER' LIMIT 1`);
  if (t) await db.execute(sql`INSERT INTO UserRole (user_id, role_id) VALUES (${teacher}, ${t.role_id})`);
  return { students, lead, teacher };
}

async function main() {
  const useFixtures = process.argv.includes("--fixtures");
  const f = useFixtures ? await fixtures() : null;
  const students = f?.students ?? (await many(sql`
    SELECT u.user_id AS id FROM User u JOIN UserProfile p ON p.user_id = u.user_id
    WHERE u.status = 'ACTIVE' AND p.user_type = 'STUDENT' AND p.registration_number IS NOT NULL ORDER BY u.user_id DESC LIMIT 12`)).map((r) => Number(r.id));
  if (!students.length) throw new Error("No students with a registration number. Run with --fixtures.");
  const staff = f?.teacher ?? Number((await one(sql`SELECT u.user_id AS id FROM User u JOIN UserProfile p ON p.user_id = u.user_id WHERE u.status = 'ACTIVE' AND p.user_type = 'TEACHER' LIMIT 1`))?.id ?? 0);
  const reviewer = f?.lead ?? staff;
  const cats = new Map((await many(sql`SELECT category_id AS id, slug FROM SideProjectCategory`)).map((c) => [c.slug, Number(c.id)]));

  for (const [i, p] of PROJECTS.entries()) {
    const owner = students[i % students.length];
    const concept = await tmp("concept-note.pdf", pdf(`${p.title} - concept note`));
    const id = await createProject(owner, owner, {
      title: p.title,
      problemStatement: p.problem,
      categoryId: cats.get(p.cat),
      techTags: p.tags,
      githubUrl: p.github,
      accessUrl: p.live,
      supervisorId: staff && i % 3 === 0 ? staff : undefined,
      targetDate: p.status !== "IDEA" ? (i % 4 === 1 ? "2026-11-01" : "2027-03-30") : undefined,
      status: p.status === "COMPLETED" ? "IN_PROGRESS" : p.status,
      concept,
    } as any);
    const a = () => accessProject(id, { userId: owner });
    if (p.status !== "IDEA") {
      const img = await tmp("screenshot.png", await cover(p.color, p.title));
      const assets = await storeProjectFiles(id, owner, [img]);
      await addMedia(id, assets, owner, ["First prototype"]);
      if (i % 2 === 0) {
        const srs = await tmp("srs.pdf", pdf(`${p.title} - SRS`));
        const [asset] = await storeProjectFiles(id, owner, [srs]);
        const { addDocument } = await import("../src/services/sideProjects/files");
        await addDocument(id, "SRS", asset, owner);
      }
      const m1 = await addMilestone(await a(), owner, { title: "Research and design" });
      const m2 = await addMilestone(await a(), owner, { title: "First working prototype", dueDate: "2026-12-10" });
      await addMilestone(await a(), owner, { title: "Test with users" });
      await updateMilestone(await a(), owner, m1, { done: true });
      if (p.status === "COMPLETED" || i % 2 === 0) await updateMilestone(await a(), owner, m2, { done: true });
      await addUpdate(await a(), owner, { did: "Finished the first prototype and showed it to classmates.", nextSteps: "Collect feedback and fix the rough edges.", blockers: p.blocked ? "Waiting for the school Wi-Fi to allow the test server." : undefined, mood: p.blocked ? 2 : 4 });
    }
    if (p.status === "COMPLETED") {
      await moveProject(await a(), owner, { to: "COMPLETED", outcomeSummary: "Working version demoed to the class and used by real users for two weeks." });
      if (p.verified && reviewer) {
        const ra = await accessProject(id, { userId: reviewer, summary: null, detail: { all: true }, review: { all: true }, manageAny: true } as any);
        await review(ra, reviewer, { kind: "VERIFIED", body: "Great work. Verified at the project fair." });
      }
    }
    if (p.changes && reviewer) {
      const ra = await accessProject(id, { userId: reviewer, summary: null, detail: { all: true }, review: { all: true }, manageAny: true } as any);
      await review(ra, reviewer, { kind: "CHANGES_REQUESTED", body: "Add an SRS with the offline sync requirements before the next milestone." });
    }
    if (p.stale) await db.execute(sql`UPDATE SideProject SET last_activity_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) WHERE project_id = ${id}`);
    // Spread creation dates over the last months so the trend has a shape.
    const back = (PROJECTS.length - i) * 17;
    await db.execute(sql`UPDATE SideProject SET created_at = DATE_SUB(created_at, INTERVAL ${back} DAY),
      completed_at = IF(completed_at IS NULL, NULL, DATE_SUB(completed_at, INTERVAL ${Math.floor(back / 3)} DAY)) WHERE project_id = ${id}`);
    console.log(`  #${id} ${p.status.padEnd(11)} ${p.title}`);
  }
  console.log("\nDemo accounts:");
  console.log(`  students: ${students.slice(0, 4).join(", ")}${students.length > 4 ? ", …" : ""}`);
  if (f) console.log(`  projects lead (SUPER_ADMIN): ${f.lead}\n  teacher / supervisor: ${f.teacher}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
