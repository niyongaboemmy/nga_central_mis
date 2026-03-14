import { db } from "./src/db";
import { SchemeOfWorkEntry, SchemeOfWork } from "./src/db/schema";
import { sql } from "drizzle-orm";

async function inspectSOW() {
  const teacherId = 15;
  const startDate = "2026-03-06";
  const endDate = "2026-03-06";

  // Get raw rows directly without driver transformation
  const conn = (db as any).session;
  
  const entries = await db
    .select({
      id: SchemeOfWorkEntry.entry_id,
      topic: SchemeOfWorkEntry.topic,
      start: SchemeOfWorkEntry.start_date,
      end: SchemeOfWorkEntry.end_date,
      startFormatted: sql<string>`DATE_FORMAT(${SchemeOfWorkEntry.start_date}, '%Y-%m-%d')`,
      endFormatted: sql<string>`DATE_FORMAT(${SchemeOfWorkEntry.end_date}, '%Y-%m-%d')`,
    })
    .from(SchemeOfWorkEntry)
    .innerJoin(SchemeOfWork, sql`${SchemeOfWorkEntry.scheme_id} = ${SchemeOfWork.scheme_id}`)
    .where(
      sql`${SchemeOfWork.user_id} = ${teacherId}`
    )
    .limit(10);

  console.log(`All SOW entries for teacher ${teacherId}:`);
  entries.forEach(e => {
    const startObj = e.start as any;
    const endObj = e.end as any;
    console.log(`---`);
    console.log(`ID: ${e.id} | Topic: ${String(e.topic).substring(0, 40)}...`);
    console.log(`Raw start type: ${typeof startObj} | value: ${startObj}`);
    console.log(`Raw end type: ${typeof endObj} | value: ${endObj}`);
    if (startObj instanceof Date) {
      console.log(`  start ISO: ${startObj.toISOString()} | UTC date: ${startObj.getUTCFullYear()}-${String(startObj.getUTCMonth()+1).padStart(2,'0')}-${String(startObj.getUTCDate()).padStart(2,'0')}`);
    }
    if (endObj instanceof Date) {
      console.log(`  end ISO: ${endObj.toISOString()} | UTC date: ${endObj.getUTCFullYear()}-${String(endObj.getUTCMonth()+1).padStart(2,'0')}-${String(endObj.getUTCDate()).padStart(2,'0')}`);
    }
    console.log(`  DATE_FORMAT start: ${e.startFormatted} | DATE_FORMAT end: ${e.endFormatted}`);
    
    // Manually test boundary
    const formattedEnd = e.endFormatted as string;
    const formattedStart = e.startFormatted as string;
    const matches = formattedStart <= endDate && formattedEnd >= startDate;
    console.log(`  Would match for ${startDate}: ${matches} (start:${formattedStart} <= ${endDate} && end:${formattedEnd} >= ${startDate})`);
  });

  process.exit(0);
}

inspectSOW().catch(err => {
  console.error(err);
  process.exit(1);
});
