/**
 * Bulk upload guard: rows of an upload that are already people of ANOTHER school.
 *
 * 2026-11-25 a staff file uploaded into one school held six teachers of another
 * school; each got a second, unrelated account and showed up in every app of the
 * wrong school. The upload now names such rows first and lets the admin skip them
 * (the default) or add them on purpose.
 *
 * What may be said about another school (same rules as crossSchool.ts):
 *   - exact e-mail / username: any usable school -- the school-side "add someone
 *     from another school" door already answers for an exact identifier;
 *   - same first + last name (either order): ONLY schools the uploader also
 *     belongs to (linked accounts, tenancy/personLinks.ts), so nobody learns who
 *     works in a school they are not part of.
 * Only the school's name and what matched are returned, never the other account.
 */
import { RowDataPacket } from "mysql2/promise";
import { poolFor } from "../../db/pools";
import { TenantCtx, isTenantUsable } from "../../vendor/nga-tenancy";
import { getTenant } from "../../tenancy/registry";
import { lookupDirectory, normIdentifier } from "../../tenancy/directory";
import { linkedAccounts } from "../../tenancy/personLinks";
import logger from "../../utils/logger";

export interface UploadRow {
  /** Spreadsheet row number (header = 1). */
  row: number;
  username?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export type MatchBy = "email" | "username" | "name";

export interface OtherSchoolMatch {
  row: number;
  name: string;
  email: string | null;
  username: string | null;
  schools: Array<{ tid: number; school: string; by: MatchBy[] }>;
}

const norm = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").trim().replace(/\s+/g, " ").toLowerCase();
const nameKey = (a: string, b: string): string => [a, b].sort().join("|");

async function usableSchool(tid: number, cache: Map<number, TenantCtx | null>): Promise<TenantCtx | null> {
  if (!cache.has(tid)) {
    const t = await getTenant(tid).catch(() => null);
    cache.set(tid, t && isTenantUsable(t.status) ? t : null);
  }
  return cache.get(tid) ?? null;
}

async function activeAccount(tid: number, uid: number): Promise<RowDataPacket | null> {
  const [rows] = await poolFor(tid).query<RowDataPacket[]>(
    "SELECT user_id, email, username FROM `User` WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1",
    [uid],
  );
  return rows[0] ?? null;
}

/** The rows that match an ACTIVE person of another school (see the header for the rules). */
export async function otherSchoolMatches(rows: UploadRow[], current: TenantCtx, uploaderId: number): Promise<OtherSchoolMatch[]> {
  const schools = new Map<number, TenantCtx | null>();
  const found = new Map<number, Map<number, Set<MatchBy>>>(); // row -> tid -> by
  const note = (row: number, tid: number, by: MatchBy) => {
    const perRow = found.get(row) ?? new Map<number, Set<MatchBy>>();
    perRow.set(tid, (perRow.get(tid) ?? new Set<MatchBy>()).add(by));
    found.set(row, perRow);
  };

  // 1. Exact e-mail / username, every usable school (AccountDirectory).
  for (const r of rows) {
    for (const [by, value] of [["email", r.email], ["username", r.username]] as Array<[MatchBy, unknown]>) {
      const key = normIdentifier(value);
      if (!key) continue;
      const hits = await lookupDirectory(key);
      if (!hits) continue; // no directory (single school): nothing to compare with
      for (const h of hits) {
        if (h.tid === current.tid || String(h.status) !== "ACTIVE") continue;
        if (!(await usableSchool(h.tid, schools))) continue;
        try {
          const acc = await activeAccount(h.tid, h.userId);
          // The directory may be stale: the identifier must still be this account's.
          if (acc && normIdentifier(by === "email" ? acc.email : acc.username) === key) note(r.row, h.tid, by);
        } catch (err) {
          logger.warn("[uploadOtherSchools] identifier check skipped", { tid: h.tid, error: (err as Error)?.message });
        }
      }
    }
  }

  // 2. Same name, only in schools the uploader also belongs to.
  const named = rows
    .map((r) => ({ row: r.row, first: norm(r.first_name), last: norm(r.last_name) }))
    .filter((r) => r.first && r.last);
  if (named.length) {
    const tokens = [...new Set(named.flatMap((r) => [r.first, r.last]))];
    const mine = [...new Set((await linkedAccounts({ tid: current.tid, uid: uploaderId })).map((l) => l.tid))];
    for (const tid of mine) {
      if (tid === current.tid || !(await usableSchool(tid, schools))) continue;
      try {
        const [people] = await poolFor(tid).query<RowDataPacket[]>(
          `SELECT p.first_name, p.last_name FROM UserProfile p JOIN \`User\` u ON u.user_id = p.user_id
            WHERE u.status = 'ACTIVE' AND LOWER(TRIM(p.first_name)) IN (?) AND LOWER(TRIM(p.last_name)) IN (?)`,
          [tokens, tokens],
        );
        const there = new Set(people.map((p) => nameKey(norm(p.first_name), norm(p.last_name))));
        for (const r of named) if (there.has(nameKey(r.first, r.last))) note(r.row, tid, "name");
      } catch (err) {
        logger.warn("[uploadOtherSchools] name check skipped", { tid, error: (err as Error)?.message });
      }
    }
  }

  const byRow = new Map(rows.map((r) => [r.row, r]));
  return [...found.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, perTid]) => {
      const r = byRow.get(row)!;
      const name = [r.first_name, r.last_name].map((v) => (v == null ? "" : String(v).trim())).filter(Boolean).join(" ");
      return {
        row,
        name: name || String(r.username ?? r.email ?? `Row ${row}`),
        email: r.email ? String(r.email).trim() : null,
        username: r.username ? String(r.username).trim() : null,
        schools: [...perTid.entries()].map(([tid, by]) => ({ tid, school: schools.get(tid)?.name ?? `School ${tid}`, by: [...by] })),
      };
    });
}
