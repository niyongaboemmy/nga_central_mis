import { sql } from "drizzle-orm";
import { db } from "../../db";
import { fail, insertId, one, recordEvent } from "./core";
import { ProjectAccess } from "./access";
import * as v from "./validate";

/**
 * Feedback and review (plan §3.2). Staff never move a student's card: they comment,
 * request changes (the review state flips) or verify a completed project. A student's
 * comment on a project with changes requested is their answer.
 */

export type ReviewKind = "COMMENT" | "CHANGES_REQUESTED" | "VERIFIED";

export async function review(a: ProjectAccess, by: number, body: { kind?: unknown; body?: unknown }) {
  if (!a.canReview) fail(403, "NOT_REVIEWER", "You can't review this project");
  const kind = String(body.kind ?? "COMMENT").toUpperCase() as ReviewKind;
  if (!["COMMENT", "CHANGES_REQUESTED", "VERIFIED"].includes(kind)) fail(400, "VALIDATION", "Unknown review action", "kind");
  const p = a.project;
  const text =
    kind === "VERIFIED"
      ? v.text(body.body, "body", { max: 2000, label: "Note" }) ?? "Verified complete"
      : v.text(body.body, "body", { min: kind === "CHANGES_REQUESTED" ? 10 : 2, max: 2000, required: true, label: kind === "CHANGES_REQUESTED" ? "What should change" : "Comment" })!;
  if (kind === "VERIFIED" && p.status !== "COMPLETED") fail(409, "NOT_COMPLETED", "Only a completed project can be verified");
  if (kind === "VERIFIED" && p.review_state === "VERIFIED") fail(409, "ALREADY_VERIFIED", "This project is already verified");
  if (p.archived_at && kind !== "COMMENT") fail(409, "ARCHIVED", "Restore the project first");

  const r = await db.execute(sql`
    INSERT INTO SideProjectComment (project_id, author_id, kind, body, created_at)
    VALUES (${p.project_id}, ${by}, ${kind}, ${text}, UTC_TIMESTAMP())`);
  if (kind === "CHANGES_REQUESTED") {
    await db.execute(sql`UPDATE SideProject SET review_state = 'CHANGES_REQUESTED', updated_at = UTC_TIMESTAMP() WHERE project_id = ${p.project_id}`);
  } else if (kind === "VERIFIED") {
    await db.execute(sql`
      UPDATE SideProject SET review_state = 'VERIFIED', verified_at = UTC_TIMESTAMP(), verified_by = ${by}, updated_at = UTC_TIMESTAMP()
      WHERE project_id = ${p.project_id}`);
  }
  if (kind !== "COMMENT") await recordEvent(Number(p.project_id), by, "REVIEW", p.review_state, kind === "VERIFIED" ? "VERIFIED" : "CHANGES_REQUESTED", null);
  return insertId(r);
}

/** A team member's reply. Answering "changes requested" sends the project back to review. */
export async function reply(a: ProjectAccess, by: number, body: { body?: unknown }) {
  if (!a.canEdit && !a.canReview) fail(403, "NOT_OWNER", "You can't comment on this project");
  const text = v.text(body.body, "body", { min: 2, max: 2000, required: true, label: "Comment" })!;
  const r = await db.execute(sql`
    INSERT INTO SideProjectComment (project_id, author_id, kind, body, created_at)
    VALUES (${a.project.project_id}, ${by}, 'COMMENT', ${text}, UTC_TIMESTAMP())`);
  if (a.canEdit && a.project.review_state === "CHANGES_REQUESTED") {
    const next = a.project.status === "COMPLETED" ? "AWAITING_VERIFICATION" : "NONE";
    await db.execute(sql`UPDATE SideProject SET review_state = ${next}, last_activity_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE project_id = ${a.project.project_id}`);
    await recordEvent(Number(a.project.project_id), by, "REVIEW", "CHANGES_REQUESTED", next, "answered");
  }
  return insertId(r);
}

export async function deleteComment(a: ProjectAccess, by: number, commentId: number) {
  const c = await one(sql`SELECT author_id FROM SideProjectComment WHERE comment_id = ${commentId} AND project_id = ${a.project.project_id} AND deleted_at IS NULL`);
  if (!c) fail(404, "NOT_FOUND", "Comment not found");
  if (Number(c.author_id) !== by && !a.manageAny) fail(403, "NOT_OWNER", "Only its author can remove a comment");
  await db.execute(sql`UPDATE SideProjectComment SET deleted_at = UTC_TIMESTAMP() WHERE comment_id = ${commentId}`);
}
