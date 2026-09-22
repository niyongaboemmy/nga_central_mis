/**
 * One-off: creates a DRAFT e-learning course for every APPROVED scheme of work in the current
 * term (or the term given as --term=<id>) so teachers start from a pre-filled builder instead of
 * an empty one. Idempotent — schemes that already have a course are skipped. Courses stay DRAFT:
 * nothing becomes visible to students until the teacher publishes.
 *
 * Usage: npx ts-node scripts/seedCoursesFromSchemes.ts [--term=12] [--all]
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { AcademicTerm, Course, SchemeOfWork } from "../src/db/schema";
import { ensureCourseForScheme } from "../src/services/elearning/courseSeeding";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
  const all = process.argv.includes("--all");
  let termId = arg("term") ? parseInt(arg("term")!, 10) : null;
  if (!termId && !all) {
    const [term] = await db.select({ id: AcademicTerm.academic_term_id }).from(AcademicTerm).where(eq(AcademicTerm.is_current, 1)).limit(1);
    if (!term) throw new Error("No current academic term. Pass --term=<id> or --all.");
    termId = term.id;
  }
  const schemes = await db
    .select({ scheme_id: SchemeOfWork.scheme_id, user_id: SchemeOfWork.user_id, subject_id: SchemeOfWork.subject_id })
    .from(SchemeOfWork)
    .leftJoin(Course, eq(Course.scheme_id, SchemeOfWork.scheme_id))
    .where(and(eq(SchemeOfWork.validation_status, "APPROVED"), isNull(Course.course_id), termId ? eq(SchemeOfWork.academic_term_id, termId) : undefined));
  console.log(`${schemes.length} approved scheme(s) without a course${termId ? ` in term ${termId}` : ""}.`);
  let created = 0;
  for (const s of schemes) {
    const course = await ensureCourseForScheme(s.scheme_id, s.user_id);
    console.log(`  scheme ${s.scheme_id} → course ${course.course_id} "${course.title}"`);
    created += 1;
  }
  console.log(`Done: ${created} course(s) created (DRAFT).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
