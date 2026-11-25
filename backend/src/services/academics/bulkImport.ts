import { eq } from "drizzle-orm";
import { db } from "../../db";
import { ClassGroup, CourseCategory, Grade, GradeSubject, Program, Subject } from "../../db/schema";
import { ValidationError } from "../../errors/CustomError";
import { sanitizeString } from "../../utils/sanitization";
import { nextSubjectColor } from "../../utils/subjectColors";

/**
 * Bulk upload of grades and subjects from an Excel sheet.
 *
 * The browser reads the sheet and sends the rows as JSON. Every name in a row
 * (program, grade, category, subject, code) is compared lower-cased and with
 * spaces collapsed, so "SPES  Year 1", "spes year 1" and "Spes Year 1 " are
 * the same grade. Names are stored as typed; only the comparison ignores case.
 *
 * Each upload runs twice: a dry run that reports every row (create / update /
 * link / skip / error), then the commit, which checks the rows again and saves
 * the valid ones in one transaction. Rows with errors are never saved.
 */

export const MAX_IMPORT_ROWS = 1000;

export type RowAction = "create" | "update" | "assign" | "skip" | "error";

export interface ImportRowResult {
  line: number;
  label: string;
  action: RowAction;
  errors: string[];
  warnings: string[];
  /** What the row will do / did, in words (e.g. "Level order 3 -> 4"). */
  changes: string[];
}

export interface ImportSummary {
  dryRun: boolean;
  total: number;
  create: number;
  update: number;
  assign: number;
  skip: number;
  error: number;
  rows: ImportRowResult[];
}

/** The comparison key for every name in an upload: trimmed, single-spaced, lower case. */
export const nameKey = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** A cell as display text: trimmed, single-spaced, case kept. */
const cell = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();

const summarize = (dryRun: boolean, rows: ImportRowResult[]): ImportSummary => {
  const count = (a: RowAction) => rows.filter((r) => r.action === a).length;
  return {
    dryRun,
    total: rows.length,
    create: count("create"),
    update: count("update"),
    assign: count("assign"),
    skip: count("skip"),
    error: count("error"),
    rows,
  };
};

const listNames = (names: string[], max = 6) =>
  names.length === 0
    ? "none set up yet"
    : names.slice(0, max).join(", ") + (names.length > max ? `, … (${names.length - max} more)` : "");

function checkRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) throw new ValidationError("Send the rows of the sheet as a list");
  if (rows.length === 0) throw new ValidationError("The sheet has no rows to upload");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new ValidationError(`Upload at most ${MAX_IMPORT_ROWS} rows at a time`);
  return rows.map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}));
}

/** A whole number in [min, max], blank = null, anything else = an error message. */
function wholeNumber(v: unknown, label: string, min: number, max: number): { value: number | null; error?: string } {
  const s = cell(v);
  if (!s) return { value: null };
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max)
    return { value: null, error: `${label} must be a whole number from ${min} to ${max} (got "${s}")` };
  return { value: n };
}

// ---------------------------------------------------------------------------
// Grades
// ---------------------------------------------------------------------------

export interface GradeRef {
  grade_id: number;
  program_id: number;
  name: string;
  level_order: number;
  rqf_level: number | null;
}
export interface ProgramRef {
  program_id: number;
  name: string;
}

export interface PlannedGrade {
  result: ImportRowResult;
  insert?: { program_id: number; name: string; level_order: number; rqf_level: number | null };
  update?: { grade_id: number; level_order?: number; rqf_level?: number | null };
}

/** Decide what every grade row does, without touching the database. */
export function planGradeImport(
  input: Record<string, unknown>[],
  programs: ProgramRef[],
  grades: GradeRef[],
): PlannedGrade[] {
  const programByKey = new Map(programs.map((p) => [nameKey(p.name), p]));
  const gradeByKey = new Map(grades.map((g) => [`${g.program_id}|${nameKey(g.name)}`, g]));
  const programNames = new Map(programs.map((p) => [p.program_id, p.name]));
  // Level orders already in use: existing grades, then each new row as it is planned.
  const levelUsers = new Map<number, string[]>();
  const useLevel = (lvl: number, who: string) => levelUsers.set(lvl, [...(levelUsers.get(lvl) ?? []), who]);
  grades.forEach((g) => useLevel(g.level_order, g.name));
  let nextLevel = Math.max(0, ...grades.map((g) => g.level_order)) + 1;
  const seen = new Map<string, number>();

  return input.map((raw, i) => {
    const line = Number(raw.line) || i + 2;
    const name = cell(raw.name);
    const programText = cell(raw.program);
    const result: ImportRowResult = { line, label: name || "(no name)", action: "error", errors: [], warnings: [], changes: [] };

    if (!name) result.errors.push("Grade name is missing");
    else if (name.length > 50) result.errors.push("Grade name is longer than 50 characters");

    const program = programText ? programByKey.get(nameKey(programText)) : undefined;
    if (!programText) result.errors.push("Program is missing");
    else if (!program)
      result.errors.push(`No program called "${programText}". Programs: ${listNames(programs.map((p) => p.name))}`);

    const level = wholeNumber(raw.level_order, "Level order", 1, 10000);
    if (level.error) result.errors.push(level.error);
    const rqf = wholeNumber(cell(raw.rqf_level).replace(/^(level|l)\s*/i, ""), "RQF level", 1, 8);
    if (rqf.error) result.errors.push(rqf.error);

    if (program && name) {
      const key = `${program.program_id}|${nameKey(name)}`;
      const dupLine = seen.get(key);
      if (dupLine) result.errors.push(`Same grade as line ${dupLine} (names are compared ignoring case)`);
      else seen.set(key, line);
    }

    if (result.errors.length > 0) return { result };

    const existing = gradeByKey.get(`${program!.program_id}|${nameKey(name)}`);
    if (existing) {
      result.label = existing.name;
      const update: PlannedGrade["update"] = { grade_id: existing.grade_id };
      if (level.value !== null && level.value !== existing.level_order) {
        update.level_order = level.value;
        result.changes.push(`Level order ${existing.level_order} → ${level.value}`);
      }
      if (rqf.value !== null && rqf.value !== existing.rqf_level) {
        update.rqf_level = rqf.value;
        result.changes.push(`RQF level ${existing.rqf_level ?? "none"} → ${rqf.value}`);
      }
      if (existing.name !== name)
        result.warnings.push(`Matches the existing grade "${existing.name}" (case ignored); its name is kept`);
      if (result.changes.length === 0) {
        result.action = "skip";
        result.warnings.push("Already exists with the same details");
        return { result };
      }
      result.action = "update";
      if (update.level_order !== undefined) {
        const others = (levelUsers.get(update.level_order) ?? []).filter((n) => n !== existing.name);
        if (others.length) result.warnings.push(`Level order ${update.level_order} is also used by ${others.join(", ")}`);
        useLevel(update.level_order, existing.name);
      }
      return { result, update };
    }

    const levelOrder = level.value ?? nextLevel;
    if (level.value === null) result.changes.push(`Level order ${levelOrder} (next free number)`);
    const others = levelUsers.get(levelOrder) ?? [];
    if (others.length)
      result.warnings.push(
        `Level order ${levelOrder} is also used by ${others.join(", ")}; promotion uses this order to find the next grade`,
      );
    useLevel(levelOrder, name);
    nextLevel = Math.max(nextLevel, levelOrder + 1);
    result.action = "create";
    result.changes.unshift(`New grade in ${programNames.get(program!.program_id)}`);
    return {
      result,
      insert: { program_id: program!.program_id, name: sanitizeString(name), level_order: levelOrder, rqf_level: rqf.value },
    };
  });
}

export async function runGradeImport(rows: unknown, dryRun: boolean): Promise<ImportSummary> {
  const input = checkRows(rows);
  const [programs, grades] = await Promise.all([
    db.select({ program_id: Program.program_id, name: Program.name }).from(Program),
    db
      .select({
        grade_id: Grade.grade_id,
        program_id: Grade.program_id,
        name: Grade.name,
        level_order: Grade.level_order,
        rqf_level: Grade.rqf_level,
      })
      .from(Grade),
  ]);
  const plan = planGradeImport(input, programs as ProgramRef[], grades as GradeRef[]);

  if (!dryRun) {
    await db.transaction(async (tx) => {
      for (const p of plan) {
        if (p.insert) await tx.insert(Grade).values(p.insert);
        if (p.update) {
          const { grade_id, ...set } = p.update;
          await tx.update(Grade).set(set).where(eq(Grade.grade_id, grade_id));
        }
      }
    });
  }
  return summarize(dryRun, plan.map((p) => p.result));
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export interface SubjectRef {
  subject_id: number;
  code: string | null;
  name: string;
  color: string | null;
  status: string | null;
}
export interface CategoryRef {
  category_id: number;
  name: string;
}
export interface GradeWithProgram {
  grade_id: number;
  name: string;
  program_name: string;
}

/**
 * Finds a grade by its name, compared in lower case with spaces collapsed. When two
 * programs share a grade name, "Year 1 (SPES)" picks one.
 */
export function gradeResolver(grades: GradeWithProgram[]) {
  const byName = new Map<string, GradeWithProgram[]>();
  for (const g of grades) {
    byName.set(nameKey(g.name), [...(byName.get(nameKey(g.name)) ?? []), g]);
    byName.set(nameKey(`${g.name} (${g.program_name})`), [g]);
  }
  return (text: string): { grade?: GradeWithProgram; error?: string } => {
    const matches = byName.get(nameKey(text)) ?? [];
    if (matches.length === 1) return { grade: matches[0] };
    if (matches.length === 0)
      return { error: `No grade called "${text}". Grades: ${listNames(grades.map((g) => g.name))}` };
    return {
      error: `"${text}" matches ${matches.length} grades; write it as ${matches
        .map((m) => `"${m.name} (${m.program_name})"`)
        .join(" or ")}`,
    };
  };
}

export interface PlannedSubject {
  result: ImportRowResult;
  /** A new subject to insert (then linked to `gradeIds`). */
  insert?: {
    code: string | null;
    name: string;
    description: string | null;
    course_category_id: number | null;
    max_marks: number | null;
    color: string;
    rqf_level: string | null;
    learning_hours: string | null;
    module_weight: number | null;
  };
  /** An existing subject to link. */
  subjectId?: number;
  gradeIds: number[];
}

const splitList = (v: unknown) =>
  String(v ?? "")
    .split(/[,;|\n]/)
    .map(cell)
    .filter(Boolean);

/**
 * Decide what every subject row does, without touching the database. Every
 * subject is linked to `targetGradeId` plus any grades named in its "grades"
 * column. A subject that already exists (same code, or same name when the row
 * has no code) is linked, never duplicated or edited.
 */
export function planSubjectImport(
  input: Record<string, unknown>[],
  ctx: {
    targetGradeId: number | null;
    grades: GradeWithProgram[];
    subjects: SubjectRef[];
    categories: CategoryRef[];
    links: { grade_id: number; subject_id: number }[];
  },
): PlannedSubject[] {
  const gradeName = new Map(ctx.grades.map((g) => [g.grade_id, g.name]));
  const findGrade = gradeResolver(ctx.grades);
  const categoryByKey = new Map(ctx.categories.map((c) => [nameKey(c.name), c]));
  const subjectByCode = new Map(
    ctx.subjects.filter((s) => s.code).map((s) => [nameKey(s.code), s]),
  );
  const activeByName = new Map<string, SubjectRef[]>();
  for (const s of ctx.subjects.filter((s) => s.status !== "DISABLED"))
    activeByName.set(nameKey(s.name), [...(activeByName.get(nameKey(s.name)) ?? []), s]);
  const linked = new Set(ctx.links.map((l) => `${l.grade_id}|${l.subject_id}`));
  const takenColors = ctx.subjects.map((s) => s.color);
  const seenCode = new Map<string, number>();
  const seenName = new Map<string, number>();

  return input.map((raw, i) => {
    const line = Number(raw.line) || i + 2;
    const name = cell(raw.name);
    const code = cell(raw.code);
    const description = cell(raw.description);
    const categoryText = cell(raw.category);
    const rqfLevel = cell(raw.rqf_level);
    const learningHours = cell(raw.learning_hours);
    const colorText = cell(raw.color);
    const result: ImportRowResult = {
      line,
      label: code ? `${name || "(no name)"} · ${code}` : name || "(no name)",
      action: "error",
      errors: [],
      warnings: [],
      changes: [],
    };
    const err = (m: string) => result.errors.push(m);

    if (!name) err("Subject name is missing");
    else if (name.length > 150) err("Subject name is longer than 150 characters");
    if (code.length > 50) err("Code is longer than 50 characters");
    if (description.length > 255) err("Description is longer than 255 characters");
    if (rqfLevel.length > 50) err("RQF level is longer than 50 characters");
    if (learningHours.length > 100) err("Learning hours is longer than 100 characters");

    const category = categoryText ? categoryByKey.get(nameKey(categoryText)) : undefined;
    if (categoryText && !category)
      err(`No course category called "${categoryText}". Categories: ${listNames(ctx.categories.map((c) => c.name))}`);

    const maxMarks = wholeNumber(raw.max_marks, "Max marks", 0, 1000);
    if (maxMarks.error) err(maxMarks.error);
    const weight = wholeNumber(raw.module_weight, "Module weight", 1, 1000);
    if (weight.error) err(weight.error);

    let color: string | null = null;
    if (colorText) {
      const hex = colorText.replace(/^#/, "");
      if (/^[0-9a-f]{6}$/i.test(hex)) color = `#${hex.toUpperCase()}`;
      else err(`Colour must be a hex value like #3B82F6 (got "${colorText}")`);
    }

    // Target grades: the grade picked in the upload dialog + the "grades" column.
    const gradeIds = new Set<number>();
    if (ctx.targetGradeId) gradeIds.add(ctx.targetGradeId);
    for (const g of splitList(raw.grades)) {
      const found = findGrade(g);
      if (found.grade) gradeIds.add(found.grade.grade_id);
      else err(found.error!);
    }
    if (gradeIds.size === 0) err("No grade: pick a grade above or fill the grades column");

    // Repeats inside the file.
    if (code) {
      const dup = seenCode.get(nameKey(code));
      if (dup) err(`Same code as line ${dup} (codes are compared ignoring case)`);
      else seenCode.set(nameKey(code), line);
    } else if (name) {
      const dup = seenName.get(nameKey(name));
      if (dup) err(`Same subject as line ${dup} (names are compared ignoring case)`);
      else seenName.set(nameKey(name), line);
    }

    // Existing subject?
    let existing: SubjectRef | undefined;
    if (code) {
      existing = subjectByCode.get(nameKey(code));
      if (existing?.status === "DISABLED") {
        err(`Code "${code}" belongs to the disabled subject "${existing.name}"; enable it or use another code`);
        existing = undefined;
      }
      if (existing && name && nameKey(existing.name) !== nameKey(name))
        result.warnings.push(`Code ${code} is already "${existing.name}"; that subject is used and its name is kept`);
      if (!existing && name && activeByName.has(nameKey(name)))
        result.warnings.push(`A subject called "${name}" already exists with another code; a second one will be created`);
    } else if (name) {
      const matches = activeByName.get(nameKey(name)) ?? [];
      if (matches.length > 1)
        err(`${matches.length} subjects are called "${name}"; add the code (${matches.map((m) => m.code || "no code").join(", ")})`);
      else existing = matches[0];
    }

    if (result.errors.length > 0) return { result, gradeIds: [] };

    const ids = [...gradeIds];
    const gradeList = (list: number[]) => list.map((id) => gradeName.get(id) ?? `#${id}`).join(", ");

    if (existing) {
      result.label = existing.code ? `${existing.name} · ${existing.code}` : existing.name;
      const toLink = ids.filter((id) => !linked.has(`${id}|${existing!.subject_id}`));
      const detailCols = [description, categoryText, cell(raw.max_marks), rqfLevel, learningHours, cell(raw.module_weight), colorText];
      if (detailCols.some(Boolean))
        result.warnings.push("Subject already exists: only the grade link is added, its details are not changed");
      if (toLink.length === 0) {
        result.action = "skip";
        result.warnings.push(`Already in ${gradeList(ids)}`);
        return { result, gradeIds: [] };
      }
      toLink.forEach((id) => linked.add(`${id}|${existing!.subject_id}`));
      result.action = "assign";
      result.changes.push(`Existing subject → ${gradeList(toLink)}`);
      return { result, subjectId: existing.subject_id, gradeIds: toLink };
    }

    if (!color) {
      color = nextSubjectColor(takenColors);
      result.changes.push(`Colour ${color} (auto)`);
    }
    takenColors.push(color);
    result.action = "create";
    result.changes.unshift(`New subject → ${gradeList(ids)}`);
    return {
      result,
      gradeIds: ids,
      insert: {
        code: code ? sanitizeString(code) : null,
        name: sanitizeString(name),
        description: description ? sanitizeString(description) : null,
        course_category_id: category?.category_id ?? null,
        max_marks: maxMarks.value,
        color,
        rqf_level: rqfLevel ? sanitizeString(rqfLevel) : null,
        learning_hours: learningHours ? sanitizeString(learningHours) : null,
        module_weight: weight.value,
      },
    };
  });
}

export async function runSubjectImport(
  rows: unknown,
  targetGradeId: number | null,
  dryRun: boolean,
): Promise<ImportSummary> {
  const input = checkRows(rows);
  const [grades, subjects, categories, links] = await Promise.all([
    db
      .select({ grade_id: Grade.grade_id, name: Grade.name, program_name: Program.name })
      .from(Grade)
      .innerJoin(Program, eq(Grade.program_id, Program.program_id)),
    db
      .select({
        subject_id: Subject.subject_id,
        code: Subject.code,
        name: Subject.name,
        color: Subject.color,
        status: Subject.status,
      })
      .from(Subject),
    db
      .select({ category_id: CourseCategory.category_id, name: CourseCategory.name })
      .from(CourseCategory)
      .where(eq(CourseCategory.status, "ACTIVE")),
    db.select({ grade_id: GradeSubject.grade_id, subject_id: GradeSubject.subject_id }).from(GradeSubject),
  ]);
  if (targetGradeId !== null && !grades.some((g) => g.grade_id === targetGradeId))
    throw new ValidationError("The selected grade does not exist");

  const plan = planSubjectImport(input, {
    targetGradeId,
    grades: grades as GradeWithProgram[],
    subjects: subjects as SubjectRef[],
    categories: categories as CategoryRef[],
    links,
  });

  if (!dryRun) {
    await db.transaction(async (tx) => {
      for (const p of plan) {
        let subjectId = p.subjectId;
        if (p.insert) {
          const res: any = await tx.insert(Subject).values(p.insert);
          subjectId = Number(res?.[0]?.insertId ?? res?.insertId);
        }
        if (!subjectId || p.gradeIds.length === 0) continue;
        await tx.insert(GradeSubject).values(p.gradeIds.map((grade_id) => ({ grade_id, subject_id: subjectId! })));
      }
    });
  }
  return summarize(dryRun, plan.map((p) => p.result));
}

// ---------------------------------------------------------------------------
// Class groups
// ---------------------------------------------------------------------------

export interface PlannedClassGroup {
  result: ImportRowResult;
  insert?: { grade_id: number; name: string };
}

/**
 * Decide what every class group row does, without touching the database. The grade
 * is found by name in lower case; a class group already in that grade (same name,
 * case ignored) is skipped, never created twice.
 */
export function planClassGroupImport(
  input: Record<string, unknown>[],
  grades: GradeWithProgram[],
  existing: { grade_id: number; name: string }[],
): PlannedClassGroup[] {
  const findGrade = gradeResolver(grades);
  const taken = new Map(existing.map((c) => [`${c.grade_id}|${nameKey(c.name)}`, c.name]));
  const seen = new Map<string, number>();

  return input.map((raw, i) => {
    const line = Number(raw.line) || i + 2;
    const name = cell(raw.name);
    const gradeText = cell(raw.grade);
    const result: ImportRowResult = { line, label: name || "(no name)", action: "error", errors: [], warnings: [], changes: [] };

    if (!name) result.errors.push("Class name is missing");
    else if (name.length > 50) result.errors.push("Class name is longer than 50 characters");

    let grade: GradeWithProgram | undefined;
    if (!gradeText) result.errors.push("Grade is missing");
    else {
      const found = findGrade(gradeText);
      if (found.grade) grade = found.grade;
      else result.errors.push(found.error!);
    }

    if (grade && name) {
      const key = `${grade.grade_id}|${nameKey(name)}`;
      const dup = seen.get(key);
      if (dup) result.errors.push(`Same class as line ${dup} (names are compared ignoring case)`);
      else seen.set(key, line);
    }
    if (result.errors.length > 0) return { result };

    const key = `${grade!.grade_id}|${nameKey(name)}`;
    const already = taken.get(key);
    if (already) {
      result.action = "skip";
      result.label = already;
      result.warnings.push(`Already in ${grade!.name}`);
      return { result };
    }
    taken.set(key, name);
    result.action = "create";
    result.changes.push(`New class in ${grade!.name} (${grade!.program_name})`);
    return { result, insert: { grade_id: grade!.grade_id, name: sanitizeString(name) } };
  });
}

export async function runClassGroupImport(rows: unknown, dryRun: boolean): Promise<ImportSummary> {
  const input = checkRows(rows);
  const [grades, existing] = await Promise.all([
    db
      .select({ grade_id: Grade.grade_id, name: Grade.name, program_name: Program.name })
      .from(Grade)
      .innerJoin(Program, eq(Grade.program_id, Program.program_id)),
    db.select({ grade_id: ClassGroup.grade_id, name: ClassGroup.name }).from(ClassGroup),
  ]);
  const plan = planClassGroupImport(input, grades as GradeWithProgram[], existing);
  if (!dryRun) {
    const inserts = plan.filter((p) => p.insert).map((p) => p.insert!);
    if (inserts.length) await db.transaction(async (tx) => { await tx.insert(ClassGroup).values(inserts); });
  }
  return summarize(dryRun, plan.map((p) => p.result));
}
