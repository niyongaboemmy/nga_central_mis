/**
 * GAP-C: an old printed scheme-of-work QR (`/verify/<id>` without `t`) is read from
 * tenant 1, so it vouches only for a tenant-1 scheme created before the signed links
 * shipped (LEGACY_QR_CUTOFF). A later scheme with that id may be another school's
 * document: the page asks for a re-printed copy. The verified page always names the
 * issuing school.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { poolFor } from "../db/pools";
import { LEGACY_QR_CUTOFF, LEGACY_QR_REPRINT_MESSAGE, schemeVerifySig } from "../services/schemeVerifyLink";

const made: number[] = [];

async function scheme(createdAt: string | null): Promise<number> {
  const pool = poolFor(1);
  const [[term]]: any = await pool.query("SELECT academic_term_id AS id FROM AcademicTerm ORDER BY academic_term_id LIMIT 1");
  const [[cg]]: any = await pool.query("SELECT class_group_id AS id FROM ClassGroup ORDER BY class_group_id LIMIT 1");
  const [[subj]]: any = await pool.query("SELECT subject_id AS id FROM Subject ORDER BY subject_id LIMIT 1");
  const [[u]]: any = await pool.query("SELECT user_id AS id FROM `User` ORDER BY user_id LIMIT 1");
  const [ins]: any = await pool.query("INSERT INTO SchemeOfWork (user_id, subject_id, class_group_id, academic_term_id) VALUES (?, ?, ?, ?)", [u.id, subj.id, cg.id, term.id]);
  const id = Number(ins.insertId);
  // Written in the session's own zone, exactly as CURRENT_TIMESTAMP would have been.
  if (createdAt) await pool.query("UPDATE SchemeOfWork SET created_at = FROM_UNIXTIME(?) WHERE scheme_id = ?", [Math.floor(new Date(createdAt).getTime() / 1000), id]);
  made.push(id);
  return id;
}

let schoolName = "";
beforeAll(async () => {
  const [[s]]: any = await poolFor(1).query("SELECT name FROM School LIMIT 1");
  schoolName = s?.name ?? "";
});

afterAll(async () => {
  for (const id of made) await poolFor(1).query("DELETE FROM SchemeOfWork WHERE scheme_id = ?", [id]).catch(() => undefined);
});

describe("GAP-C: legacy scheme-of-work QR codes", () => {
  it("GAP-C: the cutoff is the PR #169 deploy time", () => {
    expect(LEGACY_QR_CUTOFF.toISOString()).toBe("2026-11-25T13:40:00.000Z");
  });

  it("GAP-C: a no-t link verifies a tenant-1 scheme created before the cutoff, naming the school", async () => {
    const id = await scheme("2026-11-25T13:39:00Z");
    const r = await request(app).get(`/scheme-of-work/verify/${id}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.valid).toBe(true);
    expect(r.body.school_name).toBeTruthy();
    if (schoolName) expect(r.body.school_name).toBe(schoolName);
  });

  it("GAP-C: a no-t link for a scheme created at/after the cutoff asks for a re-printed copy", async () => {
    for (const at of ["2026-11-25T13:40:00Z", "2026-11-25T15:00:00Z", null]) {
      const id = await scheme(at); // null: created now
      const r = await request(app).get(`/scheme-of-work/verify/${id}`);
      expect([r.status, r.body.valid, r.body.code]).toEqual([410, false, "QR_FORMAT_OUTDATED"]);
      expect(r.body.message).toBe(LEGACY_QR_REPRINT_MESSAGE);
      expect(r.body.subject_name).toBeUndefined();
      expect(r.body.school_name).toBeUndefined();
    }
  });

  it("GAP-C: a signed link verifies a new scheme and always names the issuing school", async () => {
    const id = await scheme(null);
    const r = await request(app).get(`/scheme-of-work/verify/${id}`).query({ t: 1, s: schemeVerifySig(1, id) });
    expect([r.status, r.body.valid]).toEqual([200, true]);
    expect(typeof r.body.school_name).toBe("string");
    expect(r.body.school_name.length).toBeGreaterThan(0);
  });

  it("GAP-C: an unknown id without t is still 404", async () => {
    const r = await request(app).get("/scheme-of-work/verify/999999999");
    expect(r.status).toBe(404);
  });
});
