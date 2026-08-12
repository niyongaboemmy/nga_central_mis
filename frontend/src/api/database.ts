import api from "../services/api";

export const DB_ACCESS_TOKEN_KEY = "db_access_token";
export const DB_ACCESS_EXPIRY_KEY = "db_access_token_expiry";

const dbHeaders = () => {
  const token = sessionStorage.getItem(DB_ACCESS_TOKEN_KEY);
  return token ? { "X-Db-Access-Token": token } : {};
};

export const getDbAccessSession = (): { token: string; expiresAt: number } | null => {
  const token = sessionStorage.getItem(DB_ACCESS_TOKEN_KEY);
  const expiresAt = Number(sessionStorage.getItem(DB_ACCESS_EXPIRY_KEY) || 0);
  if (!token || !expiresAt || Date.now() >= expiresAt) return null;
  return { token, expiresAt };
};

export const clearDbAccessSession = () => {
  sessionStorage.removeItem(DB_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(DB_ACCESS_EXPIRY_KEY);
};

export const confirmDbAccess = async (password: string): Promise<{ expiresAt: number }> => {
  const response = await api.post("/auth/confirm-db-access", { password });
  const { dbAccessToken, expiresIn } = response.data.data;
  const expiresAt = Date.now() + expiresIn * 1000;
  sessionStorage.setItem(DB_ACCESS_TOKEN_KEY, dbAccessToken);
  sessionStorage.setItem(DB_ACCESS_EXPIRY_KEY, String(expiresAt));
  return { expiresAt };
};

export interface TableInfo {
  name: string;
  rows: number | null;
  sizeMb: number | null;
  engine: string | null;
}

export const getTables = async (): Promise<TableInfo[]> => {
  const response = await api.get("/database/tables", { headers: dbHeaders() });
  return response.data.data;
};

export interface ColumnInfo {
  name: string;
  type: string;
  isNullable: string;
  columnKey: string;
  defaultValue: string | null;
  extra: string;
}

export interface IndexInfo {
  name: string;
  column_name: string;
  nonUnique: number;
  seqInIndex: number;
}

export const getTableStructure = async (
  table: string,
): Promise<{ columns: ColumnInfo[]; indexes: IndexInfo[] }> => {
  const response = await api.get(`/database/tables/${table}/structure`, {
    headers: dbHeaders(),
  });
  return response.data.data;
};

export const getTableData = async (
  table: string,
  params: { page?: number; limit?: number; sortBy?: string; sortDir?: string },
): Promise<{ rows: any[]; total: number; page: number; limit: number }> => {
  const response = await api.get(`/database/tables/${table}/data`, {
    params,
    headers: dbHeaders(),
  });
  return response.data.data;
};

export const insertRow = async (table: string, values: Record<string, any>) => {
  const response = await api.post(
    `/database/tables/${table}/rows`,
    { values },
    { headers: dbHeaders() },
  );
  return response.data.data;
};

export const updateRow = async (
  table: string,
  values: Record<string, any>,
  where: Record<string, any>,
) => {
  const response = await api.put(
    `/database/tables/${table}/rows`,
    { values, where },
    { headers: dbHeaders() },
  );
  return response.data.data;
};

export const deleteRow = async (table: string, where: Record<string, any>) => {
  const response = await api.delete(`/database/tables/${table}/rows`, {
    data: { where },
    headers: dbHeaders(),
  });
  return response.data.data;
};

export interface QueryResult {
  rows: any[];
  affectedRows?: number;
  rowCount: number;
  executionMs: number;
  statementType: string;
}

export const runQuery = async (query: string, confirm = false): Promise<QueryResult> => {
  const response = await api.post(
    "/database/query",
    { query, confirm },
    { headers: dbHeaders() },
  );
  return response.data.data;
};

export interface QueryLogEntry {
  log_id: number;
  query_text: string;
  statement_type: string;
  is_write: number;
  row_count: number | null;
  execution_ms: number | null;
  status: "SUCCESS" | "ERROR";
  error_message: string | null;
  created_at: string;
  username: string | null;
  email: string | null;
}

export const getQueryHistory = async (params: {
  page?: number;
  limit?: number;
}): Promise<{
  data: QueryLogEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> => {
  const response = await api.get("/database/query/history", {
    params,
    headers: dbHeaders(),
  });
  return response.data;
};

export const exportTable = async (table: string, format: "csv" | "sql") => {
  const response = await api.get(`/database/tables/${table}/export`, {
    params: { format },
    headers: dbHeaders(),
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${table}.${format}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export interface ServerStatus {
  version: string;
  uptimeSeconds: number;
  threadsConnected: number;
  dbSizeMb: number;
}

export const getServerStatus = async (): Promise<ServerStatus> => {
  const response = await api.get("/database/status", { headers: dbHeaders() });
  return response.data.data;
};
