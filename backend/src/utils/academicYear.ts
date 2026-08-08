import { db } from "../db";
import { eq } from "drizzle-orm";
import { AcademicYear } from "../db/schema";

export async function getCurrentAcademicYearId(): Promise<number | null> {
  const [row] = await db
    .select({ academic_year_id: AcademicYear.academic_year_id })
    .from(AcademicYear)
    .where(eq(AcademicYear.is_current, 1))
    .limit(1);
  return row?.academic_year_id ?? null;
}
