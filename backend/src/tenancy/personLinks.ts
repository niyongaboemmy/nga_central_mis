/**
 * Accounts known to belong to the same person in different schools (control-plane
 * table PersonLink, platform migration 007 -- MIS-ISO-5).
 *
 * Written by a cross-school copy and by a successful switch-school (the person
 * proved they own both accounts). An e-mail match alone is not a link: any school
 * administrator can type any e-mail on an account of their school.
 *
 * Never throws: without a control plane (single-tenant installs, the table not
 * migrated yet) there simply are no links.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../db/platform";
import logger from "../utils/logger";

export interface AccountRef {
  tid: number;
  uid: number;
}

const valid = (a: AccountRef) => Number.isSafeInteger(a.tid) && a.tid > 0 && Number.isSafeInteger(a.uid) && a.uid > 0;
const ordered = (a: AccountRef, b: AccountRef): [AccountRef, AccountRef] =>
  a.tid < b.tid || (a.tid === b.tid && a.uid < b.uid) ? [a, b] : [b, a];

export async function linkPersons(a: AccountRef, b: AccountRef, via: "copy" | "switch"): Promise<void> {
  if (!valid(a) || !valid(b) || a.tid === b.tid) return;
  const [x, y] = ordered(a, b);
  try {
    await controlPool().query(
      "INSERT IGNORE INTO PersonLink (tid_a, uid_a, tid_b, uid_b, via, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())",
      [x.tid, x.uid, y.tid, y.uid, via],
    );
  } catch (err) {
    logger.warn("[personLinks] link not stored", { error: (err as Error)?.message });
  }
}

/** The accounts linked to (tid, uid), in other schools. */
export async function linkedAccounts(me: AccountRef): Promise<AccountRef[]> {
  if (!valid(me)) return [];
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      `SELECT tid_b AS tid, uid_b AS uid FROM PersonLink WHERE tid_a = ? AND uid_a = ?
       UNION SELECT tid_a AS tid, uid_a AS uid FROM PersonLink WHERE tid_b = ? AND uid_b = ?`,
      [me.tid, me.uid, me.tid, me.uid],
    );
    return rows.map((r) => ({ tid: Number(r.tid), uid: Number(r.uid) })).filter((r) => valid(r) && r.tid !== me.tid);
  } catch {
    return [];
  }
}

/** Is there a link between these two accounts? */
export async function areLinked(a: AccountRef, b: AccountRef): Promise<boolean> {
  return (await linkedAccounts(a)).some((l) => l.tid === b.tid && l.uid === b.uid);
}
