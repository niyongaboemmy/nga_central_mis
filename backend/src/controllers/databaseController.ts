import { Request, Response } from "express";
import { db } from "../db";
import { sql, desc } from "drizzle-orm";
import { DatabaseQueryLog, User, UserProfile } from "../db/schema";
import { eq } from "drizzle-orm";
import { ValidationError, NotFoundError, ServiceUnavailableError } from "../errors/CustomError";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse, paginatedResponse } from "../utils/response";
import { recordActivity } from "../utils/activityLogger";
import {
  generateStructuredContent,
  isAnyProviderConfigured,
  JSONSchema,
} from "../services/aiProviders";

const DENYLIST_PATTERNS = [
  /DROP\s+DATABASE/i,
  /DROP\s+SCHEMA/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /CREATE\s+USER/i,
  /DROP\s+USER/i,
  /ALTER\s+USER/i,
  /SET\s+GLOBAL/i,
  /\bSHUTDOWN\b/i,
  /LOAD_FILE/i,
  /INTO\s+OUTFILE/i,
];

const WRITE_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "ALTER",
  "CREATE",
  "DROP",
  "TRUNCATE",
];
const READ_KEYWORDS = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"];

const classifyStatement = (query: string) => {
  const firstWord = query.trim().split(/\s+/)[0]?.toUpperCase() || "";
  if (READ_KEYWORDS.includes(firstWord)) {
    return { statementType: firstWord, isWrite: false };
  }
  if (WRITE_KEYWORDS.includes(firstWord)) {
    return { statementType: firstWord, isWrite: true };
  }
  return { statementType: firstWord || "UNKNOWN", isWrite: true };
};

const assertSingleStatement = (query: string) => {
  const withoutTrailingSemicolon = query.trim().replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    throw new ValidationError(
      "Only a single SQL statement may be executed at a time",
    );
  }
};

const assertNotDenylisted = (query: string) => {
  const hit = DENYLIST_PATTERNS.find((pattern) => pattern.test(query));
  if (hit) {
    throw new ValidationError(
      "This statement is not permitted through the Database Management tool",
    );
  }
};

const assertTableExists = async (table: string) => {
  const result: any = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`,
  );
  const count = Number(result[0]?.[0]?.cnt || 0);
  if (count === 0) {
    throw new NotFoundError(`Table "${table}" does not exist`);
  }
};

const getTableColumns = async (table: string): Promise<string[]> => {
  const result: any = await db.execute(
    sql`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} ORDER BY ORDINAL_POSITION`,
  );
  return result[0].map((r: any) => r.COLUMN_NAME);
};

const logQuery = async (
  userId: number,
  queryText: string,
  statementType: string,
  isWrite: boolean,
  status: "SUCCESS" | "ERROR",
  options: {
    rowCount?: number;
    executionMs?: number;
    errorMessage?: string;
    ipAddress?: string;
  } = {},
) => {
  try {
    await db.insert(DatabaseQueryLog).values({
      user_id: userId,
      query_text: queryText,
      statement_type: statementType,
      is_write: isWrite ? 1 : 0,
      row_count: options.rowCount,
      execution_ms: options.executionMs,
      status,
      error_message: options.errorMessage,
      ip_address: options.ipAddress,
    });
  } catch (error) {
    // Never let audit logging failures break the actual DB operation
  }
};

export const listTables = asyncHandler(async (req: any, res: Response) => {
  const result: any = await db.execute(
    sql`SELECT TABLE_NAME as name, TABLE_ROWS as \`rows\`, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as sizeMb, ENGINE as engine
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME`,
  );
  successResponse(res, "Tables retrieved", result[0]);
});

export const getTableStructure = asyncHandler(
  async (req: any, res: Response) => {
    const { table } = req.params;
    await assertTableExists(table);

    const columns: any = await db.execute(
      sql`SELECT COLUMN_NAME as name, COLUMN_TYPE as type, IS_NULLABLE as isNullable, COLUMN_KEY as columnKey, COLUMN_DEFAULT as defaultValue, EXTRA as extra
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
          ORDER BY ORDINAL_POSITION`,
    );

    const indexes: any = await db.execute(
      sql`SELECT INDEX_NAME as name, COLUMN_NAME as column_name, NON_UNIQUE as nonUnique, SEQ_IN_INDEX as seqInIndex
          FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
          ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    );

    successResponse(res, "Table structure retrieved", {
      columns: columns[0],
      indexes: indexes[0],
    });
  },
);

export const getTableData = asyncHandler(async (req: any, res: Response) => {
  const { table } = req.params;
  await assertTableExists(table);

  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(
    500,
    Math.max(1, parseInt(String(req.query.limit || "50"), 10)),
  );
  const offset = (page - 1) * limit;

  const columns = await getTableColumns(table);

  let sortBy = String(req.query.sortBy || "");
  if (sortBy && !columns.includes(sortBy)) {
    throw new ValidationError(`Unknown column "${sortBy}"`);
  }
  const sortDir =
    String(req.query.sortDir || "ASC").toUpperCase() === "DESC"
      ? "DESC"
      : "ASC";

  const tableIdent = sql.raw(`\`${table}\``);
  const orderClause = sortBy
    ? sql.raw(`ORDER BY \`${sortBy}\` ${sortDir}`)
    : sql``;

  const search = String(req.query.search || "").trim();
  const whereClause = search
    ? sql`WHERE ${sql.join(
        columns.map(
          (c) => sql`CAST(${sql.raw(`\`${c}\``)} AS CHAR) LIKE ${`%${search}%`}`,
        ),
        sql.raw(" OR "),
      )}`
    : sql``;

  const [rowsResult, countResult] = await Promise.all([
    db.execute(
      sql`SELECT * FROM ${tableIdent} ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
    ),
    db.execute(sql`SELECT COUNT(*) as total FROM ${tableIdent} ${whereClause}`),
  ]);

  successResponse(res, "Table data retrieved", {
    rows: (rowsResult as any)[0],
    total: Number((countResult as any)[0]?.[0]?.total || 0),
    page,
    limit,
  });
});

const validateColumnMap = async (table: string, values: Record<string, any>) => {
  const columns = await getTableColumns(table);
  const keys = Object.keys(values || {});
  if (keys.length === 0) {
    throw new ValidationError("No values provided");
  }
  const invalid = keys.filter((k) => !columns.includes(k));
  if (invalid.length > 0) {
    throw new ValidationError(`Unknown column(s): ${invalid.join(", ")}`);
  }
  return keys;
};

export const insertRow = asyncHandler(async (req: any, res: Response) => {
  const { table } = req.params;
  const { values } = req.body;
  await assertTableExists(table);
  const keys = await validateColumnMap(table, values);

  const tableIdent = sql.raw(`\`${table}\``);
  const columnsIdent = sql.raw(keys.map((k) => `\`${k}\``).join(", "));
  const placeholders = sql.join(
    keys.map((k) => sql`${values[k]}`),
    sql.raw(", "),
  );

  const start = Date.now();
  try {
    const result: any = await db.execute(
      sql`INSERT INTO ${tableIdent} (${columnsIdent}) VALUES (${placeholders})`,
    );
    await logQuery(
      req.user.userId,
      `INSERT INTO ${table} (${keys.join(", ")}) VALUES (...)`,
      "INSERT",
      true,
      "SUCCESS",
      {
        rowCount: result[0]?.affectedRows,
        executionMs: Date.now() - start,
        ipAddress: req.ip,
      },
    );
    await recordActivity(
      req.user.userId,
      "DATABASE_ROW_INSERT",
      `Inserted a row into ${table} via Database Management`,
      table,
      undefined,
      { keys },
      req.user.userId,
    );
    successResponse(res, "Row inserted", {
      insertId: result[0]?.insertId,
    });
  } catch (error: any) {
    await logQuery(req.user.userId, `INSERT INTO ${table}`, "INSERT", true, "ERROR", {
      executionMs: Date.now() - start,
      errorMessage: error.message,
      ipAddress: req.ip,
    });
    throw new ValidationError(error.message);
  }
});

export const updateRow = asyncHandler(async (req: any, res: Response) => {
  const { table } = req.params;
  const { values, where } = req.body;
  await assertTableExists(table);
  const valueKeys = await validateColumnMap(table, values);
  const whereKeys = await validateColumnMap(table, where);

  const tableIdent = sql.raw(`\`${table}\``);
  const setClause = sql.join(
    valueKeys.map((k) => sql`${sql.raw(`\`${k}\``)} = ${values[k]}`),
    sql.raw(", "),
  );
  const whereClause = sql.join(
    whereKeys.map((k) => sql`${sql.raw(`\`${k}\``)} = ${where[k]}`),
    sql.raw(" AND "),
  );

  const start = Date.now();
  try {
    const result: any = await db.execute(
      sql`UPDATE ${tableIdent} SET ${setClause} WHERE ${whereClause} LIMIT 1`,
    );
    await logQuery(
      req.user.userId,
      `UPDATE ${table} SET ${valueKeys.join(", ")} WHERE ${whereKeys.join(", ")}`,
      "UPDATE",
      true,
      "SUCCESS",
      {
        rowCount: result[0]?.affectedRows,
        executionMs: Date.now() - start,
        ipAddress: req.ip,
      },
    );
    await recordActivity(
      req.user.userId,
      "DATABASE_ROW_UPDATE",
      `Updated a row in ${table} via Database Management`,
      table,
      undefined,
      { valueKeys, whereKeys },
      req.user.userId,
    );
    successResponse(res, "Row updated", {
      affectedRows: result[0]?.affectedRows,
    });
  } catch (error: any) {
    await logQuery(req.user.userId, `UPDATE ${table}`, "UPDATE", true, "ERROR", {
      executionMs: Date.now() - start,
      errorMessage: error.message,
      ipAddress: req.ip,
    });
    throw new ValidationError(error.message);
  }
});

export const deleteRow = asyncHandler(async (req: any, res: Response) => {
  const { table } = req.params;
  const { where } = req.body;
  await assertTableExists(table);
  const whereKeys = await validateColumnMap(table, where);

  const tableIdent = sql.raw(`\`${table}\``);
  const whereClause = sql.join(
    whereKeys.map((k) => sql`${sql.raw(`\`${k}\``)} = ${where[k]}`),
    sql.raw(" AND "),
  );

  const start = Date.now();
  try {
    const result: any = await db.execute(
      sql`DELETE FROM ${tableIdent} WHERE ${whereClause} LIMIT 1`,
    );
    await logQuery(
      req.user.userId,
      `DELETE FROM ${table} WHERE ${whereKeys.join(", ")}`,
      "DELETE",
      true,
      "SUCCESS",
      {
        rowCount: result[0]?.affectedRows,
        executionMs: Date.now() - start,
        ipAddress: req.ip,
      },
    );
    await recordActivity(
      req.user.userId,
      "DATABASE_ROW_DELETE",
      `Deleted a row from ${table} via Database Management`,
      table,
      undefined,
      { whereKeys },
      req.user.userId,
    );
    successResponse(res, "Row deleted", {
      affectedRows: result[0]?.affectedRows,
    });
  } catch (error: any) {
    await logQuery(req.user.userId, `DELETE FROM ${table}`, "DELETE", true, "ERROR", {
      executionMs: Date.now() - start,
      errorMessage: error.message,
      ipAddress: req.ip,
    });
    throw new ValidationError(error.message);
  }
});

export const runQuery = asyncHandler(async (req: any, res: Response) => {
  const { query, confirm } = req.body;
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new ValidationError("A SQL query is required");
  }

  assertSingleStatement(query);
  assertNotDenylisted(query);

  const { statementType, isWrite } = classifyStatement(query);
  if (isWrite && confirm !== true) {
    throw new ValidationError(
      "This is a write operation; resend with confirm: true",
    );
  }

  const start = Date.now();
  try {
    const result: any = await db.execute(sql.raw(query));
    const executionMs = Date.now() - start;
    const rows = Array.isArray(result[0]) ? result[0] : [];
    const rowCount = Array.isArray(result[0])
      ? result[0].length
      : result[0]?.affectedRows;

    await logQuery(req.user.userId, query, statementType, isWrite, "SUCCESS", {
      rowCount,
      executionMs,
      ipAddress: req.ip,
    });

    if (isWrite) {
      await recordActivity(
        req.user.userId,
        "DATABASE_QUERY_WRITE",
        `Executed a ${statementType} statement via Database Management`,
        undefined,
        undefined,
        { query },
        req.user.userId,
      );
    }

    successResponse(res, "Query executed", {
      rows: Array.isArray(result[0]) ? rows : [],
      affectedRows: !Array.isArray(result[0]) ? result[0]?.affectedRows : undefined,
      rowCount,
      executionMs,
      statementType,
    });
  } catch (error: any) {
    await logQuery(req.user.userId, query, statementType, isWrite, "ERROR", {
      executionMs: Date.now() - start,
      errorMessage: error.message,
      ipAddress: req.ip,
    });
    throw new ValidationError(error.message);
  }
});

export const getQueryHistory = asyncHandler(async (req: any, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(
    200,
    Math.max(1, parseInt(String(req.query.limit || "50"), 10)),
  );
  const offset = (page - 1) * limit;

  const [logs, countResult] = await Promise.all([
    db
      .select({
        log_id: DatabaseQueryLog.log_id,
        query_text: DatabaseQueryLog.query_text,
        statement_type: DatabaseQueryLog.statement_type,
        is_write: DatabaseQueryLog.is_write,
        row_count: DatabaseQueryLog.row_count,
        execution_ms: DatabaseQueryLog.execution_ms,
        status: DatabaseQueryLog.status,
        error_message: DatabaseQueryLog.error_message,
        created_at: DatabaseQueryLog.created_at,
        user_id: DatabaseQueryLog.user_id,
        username: User.username,
        email: User.email,
      })
      .from(DatabaseQueryLog)
      .leftJoin(User, eq(DatabaseQueryLog.user_id, User.user_id))
      .orderBy(desc(DatabaseQueryLog.created_at))
      .limit(limit)
      .offset(offset),
    db.execute(sql`SELECT COUNT(*) as total FROM DatabaseQueryLog`),
  ]);

  paginatedResponse(res, "Query history retrieved", logs, {
    page,
    limit,
    total: Number((countResult as any)[0]?.[0]?.total || 0),
    totalPages: Math.ceil(
      Number((countResult as any)[0]?.[0]?.total || 0) / limit,
    ),
  });
});

export const exportTable = asyncHandler(async (req: any, res: Response) => {
  const { table } = req.params;
  const format = req.query.format === "sql" ? "sql" : "csv";
  await assertTableExists(table);

  const tableIdent = sql.raw(`\`${table}\``);
  const result: any = await db.execute(sql`SELECT * FROM ${tableIdent}`);
  const rows: any[] = result[0];

  await recordActivity(
    req.user.userId,
    "DATABASE_TABLE_EXPORT",
    `Exported table ${table} (${format}) via Database Management`,
    table,
    undefined,
    { format, rowCount: rows.length },
    req.user.userId,
  );

  if (rows.length === 0) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${table}.${format}"`,
    );
    res.setHeader("Content-Type", "text/plain");
    return res.send("");
  }

  const columns = Object.keys(rows[0]);

  if (format === "csv") {
    const escapeCsv = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [
      columns.join(","),
      ...rows.map((r) => columns.map((c) => escapeCsv(r[c])).join(",")),
    ];
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${table}.csv"`,
    );
    res.setHeader("Content-Type", "text/csv");
    return res.send(lines.join("\n"));
  }

  const escapeSqlValue = (v: any) => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    const s = v instanceof Date ? v.toISOString() : String(v);
    return `'${s.replace(/'/g, "''")}'`;
  };
  const statements = rows.map(
    (r) =>
      `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${columns
        .map((c) => escapeSqlValue(r[c]))
        .join(", ")});`,
  );
  res.setHeader("Content-Disposition", `attachment; filename="${table}.sql"`);
  res.setHeader("Content-Type", "application/sql");
  res.send(statements.join("\n"));
});

export const getServerStatus = asyncHandler(async (req: any, res: Response) => {
  const [versionResult, uptimeResult, connResult, sizeResult] =
    await Promise.all([
      db.execute(sql`SELECT VERSION() as version`),
      db.execute(sql`SHOW STATUS LIKE 'Uptime'`),
      db.execute(sql`SHOW STATUS LIKE 'Threads_connected'`),
      db.execute(
        sql`SELECT ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as sizeMb FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
      ),
    ]);

  successResponse(res, "Server status retrieved", {
    version: (versionResult as any)[0]?.[0]?.version,
    uptimeSeconds: Number((uptimeResult as any)[0]?.[0]?.Value || 0),
    threadsConnected: Number((connResult as any)[0]?.[0]?.Value || 0),
    dbSizeMb: Number((sizeResult as any)[0]?.[0]?.sizeMb || 0),
  });
});

const sqlGenerationSchema: JSONSchema = {
  type: "object",
  properties: {
    sql: {
      type: "string",
      description:
        "A single valid MySQL statement answering the request. No markdown fences, no trailing commentary.",
    },
    explanation: {
      type: "string",
      description: "One or two plain-language sentences explaining what the query does.",
    },
  },
  required: ["sql"],
};

// Drafts a SQL query from a natural-language request, reusing the same
// multi-provider AI fallback used for AI lesson note generation. Never
// executed automatically — the admin reviews it in the editor before running it.
export const generateSqlWithAI = asyncHandler(async (req: any, res: Response) => {
  if (!isAnyProviderConfigured()) {
    throw new ServiceUnavailableError(
      "AI SQL generation is not configured. Add an API key for at least one AI provider (GEMINI_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY, or GLM_API_KEY) to the backend environment.",
    );
  }

  const { prompt, table } = req.body;
  if (!prompt || !String(prompt).trim()) {
    throw new ValidationError("Describe the query you want in plain language");
  }

  const tablesResult: any = await db.execute(
    sql`SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
  );
  const tableNames = tablesResult[0].map((r: any) => r.name);

  let structureBlock = "";
  if (table && tableNames.includes(table)) {
    const columns = await getTableColumns(table);
    structureBlock = `\nThe admin is currently viewing table "${table}" with columns: ${columns.join(", ")}.`;
  }

  const { data, providerUsed } = await generateStructuredContent<{
    sql?: string;
    explanation?: string;
  }>({
    schemaName: "database_sql_query",
    schema: sqlGenerationSchema,
    maxOutputTokens: 800,
    prompt: `You are a senior MySQL database administrator helping write a single SQL query for a school
management system database (MySQL 8).

Available tables in this database:
${tableNames.join(", ")}
${structureBlock}

The admin's request, in their own words:
"""
${String(prompt).trim()}
"""

Write ONE single valid MySQL statement that fulfils this request. Prefer SELECT unless the request explicitly
asks to insert, update, delete, or alter data. Use only the tables above, and only columns you're confident
exist given the table/column names provided — if unsure of exact columns for a table you weren't given the
structure of, prefer SELECT * over guessing specific column names. Never produce DROP DATABASE, DROP SCHEMA,
GRANT, REVOKE, CREATE USER, DROP USER, ALTER USER, SET GLOBAL, or SHUTDOWN. Do not wrap the SQL in markdown
code fences and do not include a trailing semicolon.`,
  });

  if (!data.sql) {
    throw new ValidationError("The AI could not generate a query for that request. Try rephrasing it.");
  }

  const cleanSql = data.sql
    .trim()
    .replace(/^```sql\s*/i, "")
    .replace(/```$/, "")
    .replace(/;\s*$/, "")
    .trim();

  await recordActivity(
    req.user.userId,
    "DATABASE_AI_QUERY_DRAFT",
    `Used AI (${providerUsed}) to draft a SQL query in Database Management`,
    table || undefined,
    undefined,
    { prompt: String(prompt).trim(), provider: providerUsed },
    req.user.userId,
  );

  successResponse(res, "SQL query generated", {
    sql: cleanSql,
    explanation: data.explanation || null,
    providerUsed,
  });
});
