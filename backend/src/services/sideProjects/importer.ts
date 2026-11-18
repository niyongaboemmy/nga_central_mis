import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { many, one, SideProjectError, STATUSES, titleKey } from "./core";
import { createProject } from "./projects";
import { notifyMany } from "./notify";

/**
 * Loading the existing list (plan §4.5): CSV/XLSX rows matched to students by registration
 * number. A dry run reports every row's problems; commit creates the valid rows with
 * concept_pending, so the student is asked for the concept note afterwards.
 */

export interface ImportRow {
  line: number;
  regNumber: string;
  student: string | null;
  title: string;
  status: string;
  ok: boolean;
  errors: string[];
  projectId?: number;
}

const HEADERS: Record<string, string> = {
  registration_number: "reg", reg_number: "reg", "reg. number": "reg", "reg number": "reg", regnumber: "reg", registration: "reg",
  email: "email", "e-mail": "email", owner_email: "email",
  title: "title", "project title": "title", project: "title",
  abstract: "abstract", summary: "abstract", introduction: "abstract",
  problem_statement: "problem", "problem statement": "problem", problem: "problem",
  description: "description",
  status: "status",
  category: "category",
  technologies: "tech", tech: "tech", tech_tags: "tech",
  github_url: "github", github: "github",
  access_url: "access", "live link": "access", link: "access", access: "access",
};

const STATUS_WORDS: Record<string, string> = {
  idea: "IDEA", planning: "PLANNING", design: "PLANNING", building: "IN_PROGRESS", testing: "TESTING", review: "TESTING",
  "on hold": "ON_HOLD", on_hold: "ON_HOLD", paused: "ON_HOLD", "in progress": "IN_PROGRESS", in_progress: "IN_PROGRESS", inprogress: "IN_PROGRESS", ongoing: "IN_PROGRESS",
  completed: "COMPLETED", complete: "COMPLETED", done: "COMPLETED", finished: "COMPLETED",
};

type SheetRow = { line: number; reg?: string; email?: string; title?: string; abstract?: string; problem?: string; description?: string; status?: string; category?: string; tech?: string; github?: string; access?: string };

export function parseSheet(buf: Buffer): SheetRow[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer", raw: false });
  } catch {
    throw new SideProjectError(400, "BAD_FILE", "That file can't be read. Upload a .csv or .xlsx file");
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new SideProjectError(400, "BAD_FILE", "The file has no sheet");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  if (raw.length > 1000) throw new SideProjectError(400, "TOO_MANY", "Import at most 1000 rows at a time");
  return raw.map((r, i) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      const key = HEADERS[k.trim().toLowerCase()];
      if (key) out[key] = String(v ?? "").trim();
    }
    return { ...out, line: i + 2 } as SheetRow;
  });
}

export async function runImport(buf: Buffer, by: number, dryRun: boolean) {
  const sheet = parseSheet(buf);
  const cats = await many(sql`SELECT category_id AS id, slug, LOWER(name) AS name FROM SideProjectCategory WHERE is_active = 1`);
  const seen = new Set<string>();
  const out: ImportRow[] = [];
  for (const r of sheet) {
    const errors: string[] = [];
    const reg = r.reg ?? "";
    const email = (r.email ?? "").toLowerCase();
    const title = r.title ?? "";
    const status = STATUS_WORDS[(r.status ?? "").toLowerCase()] ?? ((STATUSES as readonly string[]).includes((r.status ?? "").toUpperCase()) ? (r.status ?? "").toUpperCase() : r.status ? "" : "IDEA");
    let student: any = null;
    // Anyone may own a project: students by registration number, everyone else by email.
    if (!reg && !email) errors.push("Registration number or email missing");
    else {
      student = await one(sql`
        SELECT u.user_id AS id, u.status, p.user_type AS type, TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,''))) AS name
        FROM UserProfile p JOIN User u ON u.user_id = p.user_id
        WHERE ${reg ? sql`p.registration_number = ${reg}` : sql`LOWER(u.email) = ${email}`} LIMIT 1`);
      if (!student) errors.push(reg ? "Nobody has this registration number" : "Nobody has this email");
      else if (student.status !== "ACTIVE") errors.push("This account is not active");
    }
    if (title.length < 3) errors.push("Title missing or too short");
    if (!status) errors.push(`Unknown status "${r.status}"`);
    const problem = r.problem && r.problem.length >= 30 ? r.problem : `${r.problem || title}. (Imported: the student should complete this problem statement.)`.padEnd(30, ".");
    const key = `${reg || email}|${titleKey(title)}`;
    if (seen.has(key)) errors.push("Duplicate row in the file");
    seen.add(key);
    if (student?.id && title) {
      const dup = await one(sql`SELECT 1 AS x FROM SideProject WHERE owner_user_id = ${student.id} AND title_key = ${titleKey(title)} AND deleted_at IS NULL`);
      if (dup) errors.push("This student already has a project with this title");
    }
    const catName = (r.category ?? "").toLowerCase();
    const cat = catName ? cats.find((c) => c.slug === catName || c.name === catName) : null;
    const row: ImportRow = { line: r.line, regNumber: reg || email, student: student?.name ?? null, title, status: status || String(r.status ?? ""), ok: errors.length === 0, errors };
    if (row.ok && !dryRun) {
      try {
        row.projectId = await createProject(
          Number(student.id),
          by,
          { title, abstract: r.abstract && r.abstract.length >= 40 ? r.abstract.slice(0, 400) : undefined, problemStatement: problem, description: r.description, categoryId: cat?.id ?? null, techTags: r.tech ?? "", githubUrl: r.github, accessUrl: r.access, status },
          { conceptPending: true, allowAnyStatus: true },
        );
        await notifyMany([Number(student.id)], "side_project_concept", `Add the concept note for ${title}`, "Your project was added to the MIS. Upload its concept note.", row.projectId, false);
      } catch (e: any) {
        row.ok = false;
        row.errors.push(e instanceof SideProjectError ? e.message : "Could not create this project");
      }
    }
    out.push(row);
  }
  return { dryRun, total: out.length, valid: out.filter((r) => r.ok).length, invalid: out.filter((r) => !r.ok).length, rows: out };
}

export const TEMPLATE_CSV =
  "registration_number,email,title,problem_statement,status,category,technologies,github_url,access_url\n" +
  "2026NGA0001,,Smart irrigation,\"Farmers waste water because they cannot see soil moisture in real time.\",In progress,iot,\"Arduino, C++\",https://github.com/owner/repo,\n" +
  ",teacher@school.example,Robotics club kit,\"The club has no shared kit to teach control loops to beginners.\",Idea,robotics,Arduino,,\n";
