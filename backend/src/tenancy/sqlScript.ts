/**
 * Executes a .sql file the way the `mysql` CLI does (the production migration
 * path, .github/workflows/migrate.yml): ';'-separated statements, plus
 * DELIMITER blocks for triggers/procedures. Comment-only chunks are skipped.
 */
import crypto from "crypto";
import mysql from "mysql2/promise";

export const sha256 = (text: string) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

function meaningful(sqlText: string): boolean {
  const stripped = sqlText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(--|#)/.test(l))
    .join("\n")
    .trim();
  return stripped.replace(/;/g, "").trim().length > 0;
}

export function splitSqlScript(text: string): Array<{ sql: string; multi: boolean }> {
  const out: Array<{ sql: string; multi: boolean }> = [];
  let delim = ";";
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n");
    buf = [];
    if (!meaningful(body)) return;
    if (delim === ";") {
      out.push({ sql: body, multi: true });
    } else {
      for (const stmt of body.split(delim)) if (meaningful(stmt)) out.push({ sql: stmt.trim(), multi: false });
    }
  };
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (m) {
      flush();
      delim = m[1];
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

/** Run a whole script on a connection opened with `multipleStatements: true`. */
export async function executeSqlScript(conn: mysql.Connection, text: string): Promise<void> {
  for (const chunk of splitSqlScript(text)) {
    await conn.query(chunk.sql);
  }
}

/** A connection to `database` (or the server, when omitted) for DDL work. */
export function adminConnection(database?: string): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ...(database ? { database } : {}),
    multipleStatements: true,
    connectTimeout: 15000,
  });
}
