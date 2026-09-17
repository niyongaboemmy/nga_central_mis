/**
 * Give every subject a distinct academic-calendar colour in one pass.
 *
 * New subjects default to `#3B82F6`, so a catalogue that was never coloured by
 * hand paints the whole timetable one flat blue. This walks the subjects in id
 * order and assigns colours along the golden-angle hue sweep (see
 * src/utils/subjectColors.ts) — maximally separated, deterministic, and stable
 * as the catalogue grows.
 *
 * By default it only touches subjects still on the default blue and steps
 * around any hand-picked colours. `--force` reassigns everything.
 *
 * Usage:
 *   npx ts-node scripts/assign-subject-colors.ts               # dry run
 *   npx ts-node scripts/assign-subject-colors.ts --apply
 *   npx ts-node scripts/assign-subject-colors.ts --apply --force
 *   npx ts-node scripts/assign-subject-colors.ts --apply --include-disabled
 *   npx ts-node scripts/assign-subject-colors.ts --apply --db=nga_central_mis_test
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const has = (name: string) => process.argv.includes(`--${name}`);
const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const dbOverride = arg("db");
if (dbOverride) process.env.DB_NAME = dbOverride;

import { db } from "../src/db";
import { Subject } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { assignUniqueSubjectColors } from "../src/utils/subjectColors";

async function main() {
  const apply = has("apply");
  const force = has("force");
  const includeDisabled = has("include-disabled");

  const subjects = await db
    .select({
      subject_id: Subject.subject_id,
      name: Subject.name,
      color: Subject.color,
      status: Subject.status,
    })
    .from(Subject);

  const pool = includeDisabled
    ? subjects
    : subjects.filter((s) => s.status === "ACTIVE");

  const assignments = assignUniqueSubjectColors(pool, { force });
  const byId = new Map(subjects.map((s) => [s.subject_id, s]));

  console.log(
    `${pool.length} subject(s) considered — ${assignments.length} will change` +
      `${force ? " (--force)" : ""}${apply ? "" : "  [dry run]"}\n`,
  );

  for (const a of assignments) {
    const s = byId.get(a.subject_id);
    console.log(
      `  #${a.subject_id}  ${(s?.name ?? "").padEnd(46)} ` +
        `${a.previous_color ?? "—"}  →  ${a.color}`,
    );
  }

  if (!apply) {
    console.log("\nNothing written. Re-run with --apply to persist.");
    process.exit(0);
  }

  for (const a of assignments) {
    await db
      .update(Subject)
      .set({ color: a.color })
      .where(eq(Subject.subject_id, a.subject_id));
  }

  console.log(`\n✓ Updated ${assignments.length} subject(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
