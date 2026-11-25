/**
 * Database Management tool: keep every statement inside the session's own school
 * database (MIS-ISO-1, school isolation audit 2026-11-25).
 *
 * All school databases share one MySQL user (db/pools.ts), so the server would
 * happily answer `SELECT … FROM ngarw_mis_t2.User` or `amashuri_platform.Tenant`
 * from any school's connection. The tool therefore refuses (400) any statement that
 * reaches outside DATABASE():
 *   - a schema-qualified name `x.y` / `` `x`.`y` `` whose qualifier is another
 *     database this connection can see, or a system schema;
 *   - the system schemas named at all (information_schema, performance_schema,
 *     mysql, sys as a qualifier);
 *   - statements that change or list databases (USE, SHOW DATABASES/SCHEMAS,
 *     CREATE/ALTER/DROP DATABASE|SCHEMA, ATTACH), dynamic SQL (PREPARE/EXECUTE,
 *     which would hide a name inside a string), stored programs (their bodies can
 *     run dynamic SQL later) and file access.
 * Comments are stripped first; MySQL "executable comments" (`/*! … *\/`) are
 * refused outright because the server runs their contents.
 */
import { ValidationError } from "../../errors/CustomError";

const SYSTEM_SCHEMAS = ["information_schema", "performance_schema", "mysql", "sys"];
/** Named anywhere (even unqualified), these always mean "outside this school". */
const ALWAYS_FORBIDDEN_WORDS = new Set(["information_schema", "performance_schema"]);

/** Keyword sequences (on the comment-free, string-blanked text) that are never allowed. */
const FORBIDDEN_SEQUENCES: Array<{ re: RegExp; why: string }> = [
  { re: /^\s*USE\b/i, why: "USE" },
  { re: /\bSHOW\s+(DATABASES|SCHEMAS)\b/i, why: "SHOW DATABASES" },
  { re: /\b(CREATE|ALTER|DROP)\s+(DATABASE|SCHEMA)\b/i, why: "database DDL" },
  { re: /\bATTACH\b/i, why: "ATTACH" },
  { re: /\b(PREPARE|EXECUTE|DEALLOCATE)\b/i, why: "dynamic SQL" },
  { re: /\b(CREATE|ALTER)\s+(DEFINER\s*=\s*\S+\s+)?(PROCEDURE|FUNCTION|EVENT|TRIGGER)\b/i, why: "stored programs" },
  { re: /\bLOAD\s+(DATA|XML)\b/i, why: "LOAD DATA" },
  { re: /\bINTO\s+(OUTFILE|DUMPFILE)\b/i, why: "file output" },
  { re: /\bHANDLER\b/i, why: "HANDLER" },
  // Server-wide views and controls: every school's connections share one MySQL user.
  { re: /\bSHOW\s+(FULL\s+)?PROCESSLIST\b/i, why: "PROCESSLIST" },
  { re: /\bSHOW\s+(ENGINE|ENGINES|GRANTS|MASTER|SLAVE|REPLICA|REPLICAS|BINARY|BINLOG|RELAYLOG)\b/i, why: "server state" },
  { re: /^\s*(KILL|FLUSH|RESET|INSTALL|UNINSTALL|CLONE)\b/i, why: "server control" },
  { re: /\bSET\s+(PERSIST|PERSIST_ONLY)\b/i, why: "server settings" },
];

export interface ScannedSql {
  /** The statement with comments removed and string-literal contents blanked. */
  code: string;
  /** Identifier tokens in order, with whether a "." follows / precedes them. */
  tokens: Array<{ text: string; quoted: boolean; dotAfter: boolean; dotBefore: boolean }>;
}

/**
 * One pass over the SQL text: drops comments, blanks string contents (so a name
 * inside a string literal is data, not an identifier) and collects identifiers.
 */
export function scanSql(query: string): ScannedSql {
  let code = "";
  const raw: Array<{ text: string; quoted: boolean; start: number; end: number }> = [];
  const s = query;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === "/" && n === "*") {
      if (s[i + 2] === "!") throw new ValidationError("Executable comments (/*! … */) are not allowed in the Database Management tool");
      const end = s.indexOf("*/", i + 2);
      i = end < 0 ? s.length : end + 2;
      code += " ";
      continue;
    }
    if ((c === "-" && n === "-" && (i + 2 >= s.length || /\s/.test(s[i + 2]))) || c === "#") {
      const end = s.indexOf("\n", i);
      i = end < 0 ? s.length : end + 1;
      code += " ";
      continue;
    }
    if (c === "'" || c === '"') {
      // String literal: keep the quotes, blank the content (backslash and doubled-quote escapes).
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "\\") {
          j += 2;
          continue;
        }
        if (s[j] === c) {
          if (s[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      code += `${c}${c}`;
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      let text = "";
      while (j < s.length) {
        if (s[j] === "`") {
          if (s[j + 1] === "`") {
            text += "`";
            j += 2;
            continue;
          }
          break;
        }
        text += s[j];
        j++;
      }
      const start = code.length;
      code += `\`${text.replace(/`/g, "``")}\``;
      raw.push({ text, quoted: true, start, end: code.length });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z0-9_$\u0080-￿]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_$\u0080-￿]/.test(s[j])) j++;
      const text = s.slice(i, j);
      const start = code.length;
      code += text;
      raw.push({ text, quoted: false, start, end: code.length });
      i = j;
      continue;
    }
    code += c;
    i++;
  }
  // A "." between two identifiers (MySQL allows spaces around it).
  const tokens = raw.map((t, k) => {
    const after = code.slice(t.end).match(/^\s*\./);
    const before = code.slice(0, t.start).match(/\.\s*$/);
    const next = raw[k + 1];
    const prev = raw[k - 1];
    return {
      text: t.text,
      quoted: t.quoted,
      dotAfter: !!after && !!next && /^\s*\.\s*$/.test(code.slice(t.end, next.start)),
      dotBefore: !!before && !!prev && /^\s*\.\s*$/.test(code.slice(prev.end, t.start)),
    };
  });
  return { code, tokens };
}

const refuse = (why: string): never => {
  throw new ValidationError(`This statement reaches outside this school's database (${why}) and is not allowed in the Database Management tool`);
};

/**
 * Throw a 400 unless `query` stays in `ownSchema`. `visibleSchemas` = every
 * database this connection can see (information_schema.SCHEMATA), so a qualifier
 * naming any of them -- other than our own -- is refused.
 */
export function assertOwnSchema(query: string, ownSchema: string, visibleSchemas: string[]): void {
  const { code, tokens } = scanSql(query);
  for (const f of FORBIDDEN_SEQUENCES) if (f.re.test(code)) refuse(f.why);
  const own = ownSchema.toLowerCase();
  const others = new Set(
    [...visibleSchemas, ...SYSTEM_SCHEMAS].map((x) => x.toLowerCase()).filter((x) => x && x !== own),
  );
  for (const t of tokens) {
    const word = t.text.toLowerCase();
    if (ALWAYS_FORBIDDEN_WORDS.has(word)) refuse(t.text);
    // `x.y`: x is a database name unless it is ours. A table alias that happens to
    // equal another database's name is refused too (rename the alias).
    if (t.dotAfter && !t.dotBefore && others.has(word)) refuse(`${t.text}.…`);
    // Unqualified mention of another (non-system) school/platform database:
    // SHOW TABLES FROM x, SHOW COLUMNS … IN x, CALL x.p ...
    if (!t.dotBefore && others.has(word) && !SYSTEM_SCHEMAS.includes(word)) refuse(t.text);
  }
}

/** A table name from a URL: plain identifier characters only (no quoting games). */
export function assertPlainTableName(table: unknown): string {
  const t = String(table ?? "");
  if (!/^[A-Za-z0-9_$]{1,64}$/.test(t)) throw new ValidationError("Invalid table name");
  return t;
}
