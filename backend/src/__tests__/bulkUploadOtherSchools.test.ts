/**
 * Bulk upload guard (services/tenantMgmt/uploadOtherSchools.ts): rows that are
 * already people of another school are named before anything is created, then
 * skipped unless the admin ticks them. 2026-11-25 a staff file uploaded into the
 * wrong school gave six teachers a second account there.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import * as XLSX from "xlsx";
import app from "../app";
import { poolFor } from "../db/pools";
import { syncDirectoryUser } from "../tenancy/directory";
import { invalidateTenants } from "../tenancy";
import { linkPersons } from "../tenancy/personLinks";
import { controlPool } from "../db/platform";
import { ensurePlatform, provisionSchool, removeSchool, sessionToken, stampOf } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let ownerToken: string;
let teacherRole: number;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const stamp = stampOf();
const primaryIds: number[] = [];

async function primaryPerson(first: string, last: string, email: string): Promise<number> {
  const pool = poolFor(1);
  const [u]: any = await pool.query("INSERT INTO `User` (username, email, status) VALUES (?, ?, 'ACTIVE')", [`${first.toLowerCase()}_${stamp}`, email]);
  const id = Number(u.insertId);
  await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, ?, ?, 'TEACHER')", [id, first, last]);
  await syncDirectoryUser(id, 1);
  primaryIds.push(id);
  return id;
}

const sheet = (rows: Array<Record<string, string>>): Buffer => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Users");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
};

// Row 2: same e-mail as a school-1 teacher. Row 3: same name (other order), other e-mail. Row 4: new.
const ROWS = [
  { username: `dup_mail_${stamp}`, email: `mail.${stamp}@one.test`, first_name: "Aline", last_name: "Keza" },
  { username: `dup_name_${stamp}`, email: `other.${stamp}@two.test`, first_name: `Mugisha${stamp}`, last_name: "Bosco" },
  { username: `fresh_${stamp}`, email: `fresh.${stamp}@two.test`, first_name: "Fresh", last_name: "Person" },
];

const upload = (fields: Record<string, string> = {}) => {
  let r = request(app).post("/users/bulk").set(auth(ownerToken)).field("role_id", String(teacherRole));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r.attach("file", sheet(ROWS), "staff.xlsx");
};

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  ownerToken = await sessionToken(school.ownerId, school.tid);
  invalidateTenants();
  teacherRole = Number(((await poolFor(school.tid).query<any[]>("SELECT role_id FROM `Role` WHERE name = 'TEACHER'"))[0] as any[])[0]?.role_id);
  await primaryPerson("Aline", "Keza", `mail.${stamp}@one.test`);
  await primaryPerson("Bosco", `Mugisha${stamp}`, `bosco.${stamp}@one.test`);
}, 240_000);

afterAll(async () => {
  await controlPool().query("DELETE FROM PersonLink WHERE tid_b = ? OR tid_a = ?", [school?.tid, school?.tid]).catch(() => undefined);
  for (const id of primaryIds) {
    for (const t of ["UserRole", "UserProfile"]) await poolFor(1).query(`DELETE FROM ${t} WHERE user_id = ?`, [id]).catch(() => undefined);
    await poolFor(1).query("DELETE FROM `User` WHERE user_id = ?", [id]).catch(() => undefined);
  }
  await removeSchool(school?.tid, school?.applicationId);
});

describe("bulk upload: people already in another school", () => {
  it("names an exact e-mail match before creating anyone; a name alone is not said about a school the uploader is not part of", async () => {
    const r = await upload();
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.code).toBe("OTHER_SCHOOL_MATCHES");
    expect(r.body.data.matches).toEqual([
      expect.objectContaining({ row: 2, name: "Aline Keza", schools: [expect.objectContaining({ tid: 1, by: ["email"] })] }),
    ]);
    const [made]: any = await poolFor(school.tid).query("SELECT COUNT(*) n FROM `User` WHERE username LIKE ?", [`%_${stamp}`]);
    expect(Number(made[0].n)).toBe(0);
  });

  it("matches the same name (either order) in a school the uploader also belongs to", async () => {
    await linkPersons({ tid: school.tid, uid: school.ownerId }, { tid: 1, uid: primaryIds[0] }, "copy");
    const r = await upload();
    expect(r.status).toBe(409);
    expect(r.body.data.matches.map((m: any) => [m.row, m.schools[0].by])).toEqual([
      [2, ["email", "name"]],
      [3, ["name"]],
    ]);
  });

  it("after the decision, flagged rows are skipped unless ticked", async () => {
    const r = await upload({ other_schools: "decided", add_rows: JSON.stringify([3]) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ success: 2, skipped_other_school: 1 });
    const [rows]: any = await poolFor(school.tid).query("SELECT username FROM `User` WHERE username LIKE ? ORDER BY username", [`%_${stamp}`]);
    expect(rows.map((x: any) => x.username)).toEqual([`dup_name_${stamp}`, `fresh_${stamp}`]);
  });
});
