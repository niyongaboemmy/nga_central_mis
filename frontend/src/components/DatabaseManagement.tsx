import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { sql as sqlLang } from "@codemirror/lang-sql";
import {
  Database,
  Lock,
  Search,
  Table as TableIcon,
  Play,
  History,
  Download,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { usePermissions } from "../hooks/usePermissions";
import { useToast } from "../contexts/ToastContext";
import { Permissions } from "../constants/permissions";
import {
  TableInfo,
  ColumnInfo,
  IndexInfo,
  QueryLogEntry,
  ServerStatus,
  confirmDbAccess,
  getDbAccessSession,
  clearDbAccessSession,
  getTables,
  getTableStructure,
  getTableData,
  insertRow,
  updateRow,
  deleteRow,
  runQuery,
  getQueryHistory,
  exportTable,
  getServerStatus,
} from "../api/database";

const ModernCard: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <div
    className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 ${className}`}
  >
    {children}
  </div>
);

const WRITE_KEYWORDS = ["INSERT", "UPDATE", "DELETE", "REPLACE", "ALTER", "CREATE", "DROP", "TRUNCATE"];

const classifyClientSide = (query: string) => {
  const firstWord = query.trim().split(/\s+/)[0]?.toUpperCase() || "";
  return { statementType: firstWord, isWrite: WRITE_KEYWORDS.includes(firstWord) };
};

// ---------- Password gate ----------

const AccessGate: React.FC<{ onUnlocked: (expiresAt: number) => void }> = ({
  onUnlocked,
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const { expiresAt } = await confirmDbAccess(password);
      onUnlocked(expiresAt);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Incorrect password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <ModernCard className="p-8 max-w-md w-full">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Lock className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Confirm Admin Access
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The Database Management tool can read, edit, and delete data across the
            entire system. Re-enter your password to continue.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your account password"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {loading ? "Verifying..." : "Unlock Database Management"}
          </button>
        </form>
      </ModernCard>
    </div>
  );
};

// ---------- Main page ----------

type Tab = "browse" | "structure" | "export" | "query" | "history";

const DatabaseManagement: React.FC = () => {
  const { user, isLoading } = useUser();
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("browse");
  const [writeMode, setWriteMode] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("ASC");
  const [browseLoading, setBrowseLoading] = useState(false);

  const [structure, setStructure] = useState<{ columns: ColumnInfo[]; indexes: IndexInfo[] } | null>(null);

  const [queryText, setQueryText] = useState("SELECT * FROM ");
  const [queryResult, setQueryResult] = useState<{ rows: any[]; rowCount: number; executionMs: number; statementType: string; affectedRows?: number } | null>(null);
  const [queryRunning, setQueryRunning] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  const [history, setHistory] = useState<QueryLogEntry[]>([]);
  const [status, setStatus] = useState<ServerStatus | null>(null);

  const [newRow, setNewRow] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const existing = getDbAccessSession();
    if (existing) setExpiresAt(existing.expiresAt);
  }, []);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  useEffect(() => {
    if (!expiresAt) return;
    if (now >= expiresAt) {
      clearDbAccessSession();
      setExpiresAt(null);
    }
  }, [now, expiresAt]);

  useEffect(() => {
    if (!expiresAt) return;
    getTables().then(setTables).catch(() => showToast("Failed to load tables", "error"));
    getServerStatus().then(setStatus).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const loadTableData = async (table: string, pageNum = 1) => {
    setBrowseLoading(true);
    try {
      const data = await getTableData(table, { page: pageNum, limit, sortBy, sortDir });
      setRows(data.rows);
      setTotal(data.total);
      setPage(data.page);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to load table data", "error");
    } finally {
      setBrowseLoading(false);
    }
  };

  const selectTable = async (table: string) => {
    setSelectedTable(table);
    setTab("browse");
    setSortBy("");
    setSortDir("ASC");
    setNewRow(null);
    await loadTableData(table, 1);
    try {
      const s = await getTableStructure(table);
      setStructure(s);
    } catch {
      setStructure(null);
    }
  };

  useEffect(() => {
    if (selectedTable && tab === "browse") loadTableData(selectedTable, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir]);

  const loadHistory = async () => {
    try {
      const res = await getQueryHistory({ page: 1, limit: 50 });
      setHistory(res.data);
    } catch {
      showToast("Failed to load query history", "error");
    }
  };

  useEffect(() => {
    if (tab === "history") loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const primaryKeyColumn = useMemo(() => {
    return structure?.columns.find((c) => c.columnKey === "PRI")?.name || null;
  }, [structure]);

  const handleDeleteRow = async (row: any) => {
    if (!selectedTable || !primaryKeyColumn) return;
    if (!window.confirm("Delete this row? This cannot be undone.")) return;
    try {
      await deleteRow(selectedTable, { [primaryKeyColumn]: row[primaryKeyColumn] });
      showToast("Row deleted", "success");
      loadTableData(selectedTable, page);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to delete row", "error");
    }
  };

  const handleUpdateCell = async (row: any, column: string, value: string) => {
    if (!selectedTable || !primaryKeyColumn) return;
    try {
      await updateRow(
        selectedTable,
        { [column]: value },
        { [primaryKeyColumn]: row[primaryKeyColumn] },
      );
      showToast("Row updated", "success");
      loadTableData(selectedTable, page);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to update row", "error");
    }
  };

  const handleAddRow = async () => {
    if (!selectedTable || !newRow) return;
    const values: Record<string, any> = {};
    Object.entries(newRow).forEach(([k, v]) => {
      if (v !== "") values[k] = v;
    });
    try {
      await insertRow(selectedTable, values);
      showToast("Row inserted", "success");
      setNewRow(null);
      loadTableData(selectedTable, page);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to insert row", "error");
    }
  };

  const executeQuery = async (confirm = false) => {
    const { isWrite } = classifyClientSide(queryText);
    if (isWrite && !writeMode) {
      showToast("Enable write mode to run non-SELECT statements", "warning");
      return;
    }
    if (isWrite && !confirm) {
      setPendingConfirm(true);
      return;
    }
    setPendingConfirm(false);
    setQueryRunning(true);
    try {
      const result = await runQuery(queryText, confirm);
      setQueryResult(result);
      showToast("Query executed successfully", "success");
      if (tab === "history") loadHistory();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Query failed", "error");
      setQueryResult(null);
    } finally {
      setQueryRunning(false);
    }
  };

  if (isLoading) return null;
  if (!user || !hasPermission(Permissions.DATABASE_MANAGEMENT)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!expiresAt) {
    return <AccessGate onUnlocked={(exp) => setExpiresAt(exp)} />;
  }

  const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase()),
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Top bar */}
      <ModernCard className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Database Management
            </h1>
            {status && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                MySQL {status.version} &middot; {status.dbSizeMb} MB &middot;{" "}
                {status.threadsConnected} active connections
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Session expires in {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
          <button
            onClick={() => setWriteMode((w) => !w)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              writeMode
                ? "bg-red-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {writeMode ? "Write mode ON" : "Read-only"}
          </button>
          <button
            onClick={() => {
              clearDbAccessSession();
              setExpiresAt(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
          >
            <Lock className="w-3.5 h-3.5" />
            Lock
          </button>
        </div>
      </ModernCard>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Tables panel */}
        <ModernCard className="p-3 h-fit md:sticky md:top-4">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search tables..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <button
            onClick={() => {
              setSelectedTable(null);
              setTab("query");
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mb-2 ${
              tab === "query" || tab === "history"
                ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
            }`}
          >
            <Play className="w-4 h-4" />
            SQL Query
          </button>
          <div className="max-h-[55vh] overflow-y-auto space-y-1">
            {filteredTables.map((t) => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${
                  selectedTable === t.name
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <TableIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="text-xs text-gray-400 shrink-0">{t.rows ?? "-"}</span>
              </button>
            ))}
          </div>
        </ModernCard>

        {/* Main panel */}
        <div className="space-y-4">
          {selectedTable && (
            <ModernCard className="p-0 overflow-hidden">
              <div className="flex border-b border-gray-200 dark:border-gray-800">
                {(["browse", "structure", "export"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                      tab === t
                        ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "browse" && (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {selectedTable} <span className="text-gray-400 font-normal">({total} rows)</span>
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => selectedTable && loadTableData(selectedTable, page)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <RefreshCw className="w-4 h-4 text-gray-500" />
                      </button>
                      {writeMode && (
                        <button
                          onClick={() =>
                            setNewRow(
                              Object.fromEntries(
                                (structure?.columns || []).map((c) => [c.name, ""]),
                              ),
                            )
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add row
                        </button>
                      )}
                    </div>
                  </div>

                  {newRow && (
                    <ModernCard className="p-3 mb-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.keys(newRow).map((col) => (
                        <input
                          key={col}
                          value={newRow[col]}
                          onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
                          placeholder={col}
                          className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        />
                      ))}
                      <div className="col-span-full flex gap-2">
                        <button
                          onClick={handleAddRow}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setNewRow(null)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </ModernCard>
                  )}

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                          {rows[0] &&
                            Object.keys(rows[0]).map((col) => (
                              <th
                                key={col}
                                onClick={() => {
                                  setSortDir(sortBy === col && sortDir === "ASC" ? "DESC" : "ASC");
                                  setSortBy(col);
                                }}
                                className="px-2 py-2 cursor-pointer whitespace-nowrap select-none"
                              >
                                {col} {sortBy === col && (sortDir === "ASC" ? "▲" : "▼")}
                              </th>
                            ))}
                          {writeMode && <th className="px-2 py-2" />}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-100 dark:border-gray-800/60 text-gray-700 dark:text-gray-200"
                          >
                            {Object.keys(row).map((col) => (
                              <td key={col} className="px-2 py-1.5 whitespace-nowrap max-w-xs truncate">
                                {writeMode && primaryKeyColumn ? (
                                  <input
                                    defaultValue={row[col] ?? ""}
                                    onBlur={(e) => {
                                      if (e.target.value !== String(row[col] ?? "")) {
                                        handleUpdateCell(row, col, e.target.value);
                                      }
                                    }}
                                    className="w-full bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-indigo-400 rounded px-1"
                                  />
                                ) : (
                                  String(row[col] ?? "")
                                )}
                              </td>
                            ))}
                            {writeMode && (
                              <td className="px-2 py-1.5">
                                <button onClick={() => handleDeleteRow(row)}>
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {browseLoading && (
                      <p className="text-center text-xs text-gray-400 py-4">Loading...</p>
                    )}
                    {!browseLoading && rows.length === 0 && (
                      <p className="text-center text-xs text-gray-400 py-4">No rows</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      Page {page} of {Math.max(1, Math.ceil(total / limit))}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => selectedTable && loadTableData(selectedTable, page - 1)}
                        className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        disabled={page * limit >= total}
                        onClick={() => selectedTable && loadTableData(selectedTable, page + 1)}
                        className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {tab === "structure" && structure && (
                <div className="p-4 space-y-4">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                          <th className="px-2 py-2">Column</th>
                          <th className="px-2 py-2">Type</th>
                          <th className="px-2 py-2">Nullable</th>
                          <th className="px-2 py-2">Key</th>
                          <th className="px-2 py-2">Default</th>
                          <th className="px-2 py-2">Extra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {structure.columns.map((c) => (
                          <tr
                            key={c.name}
                            className="border-b border-gray-100 dark:border-gray-800/60 text-gray-700 dark:text-gray-200"
                          >
                            <td className="px-2 py-1.5 font-medium">{c.name}</td>
                            <td className="px-2 py-1.5">{c.type}</td>
                            <td className="px-2 py-1.5">{c.isNullable}</td>
                            <td className="px-2 py-1.5">{c.columnKey}</td>
                            <td className="px-2 py-1.5">{c.defaultValue ?? "—"}</td>
                            <td className="px-2 py-1.5">{c.extra}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-2">
                      Indexes
                    </h3>
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                          <th className="px-2 py-2">Name</th>
                          <th className="px-2 py-2">Column</th>
                          <th className="px-2 py-2">Unique</th>
                        </tr>
                      </thead>
                      <tbody>
                        {structure.indexes.map((idx, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-100 dark:border-gray-800/60 text-gray-700 dark:text-gray-200"
                          >
                            <td className="px-2 py-1.5">{idx.name}</td>
                            <td className="px-2 py-1.5">{idx.column_name}</td>
                            <td className="px-2 py-1.5">{idx.nonUnique === 0 ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === "export" && (
                <div className="p-4 flex gap-3">
                  <button
                    onClick={() => selectedTable && exportTable(selectedTable, "csv")}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Export as CSV
                  </button>
                  <button
                    onClick={() => selectedTable && exportTable(selectedTable, "sql")}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Export as SQL dump
                  </button>
                </div>
              )}
            </ModernCard>
          )}

          {!selectedTable && (
            <ModernCard className="p-0 overflow-hidden">
              <div className="flex border-b border-gray-200 dark:border-gray-800">
                {(["query", "history"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-3 text-sm font-medium capitalize border-b-2 flex items-center gap-1.5 transition-colors ${
                      tab === t
                        ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {t === "query" ? <Play className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
                    {t === "query" ? "SQL Query" : "Query History"}
                  </button>
                ))}
              </div>

              {tab === "query" && (
                <div className="p-4 space-y-3">
                  <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                    <CodeMirror
                      value={queryText}
                      height="180px"
                      extensions={[sqlLang()]}
                      theme="dark"
                      onChange={(value) => setQueryText(value)}
                    />
                  </div>

                  {pendingConfirm && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        This looks like a{" "}
                        <strong>{classifyClientSide(queryText).statementType}</strong> statement.
                        Confirm to run it.
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => executeQuery(true)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white"
                        >
                          Run anyway
                        </button>
                        <button
                          onClick={() => setPendingConfirm(false)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => executeQuery(false)}
                      disabled={queryRunning || !queryText.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium"
                    >
                      <Play className="w-4 h-4" />
                      {queryRunning ? "Running..." : "Run query"}
                    </button>
                    {queryResult && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {queryResult.rowCount} row(s) &middot; {queryResult.executionMs}ms
                      </span>
                    )}
                  </div>

                  {queryResult && queryResult.rows.length > 0 && (
                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-xl">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                            {Object.keys(queryResult.rows[0]).map((col) => (
                              <th key={col} className="px-2 py-2 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.map((row, i) => (
                            <tr
                              key={i}
                              className="border-b border-gray-100 dark:border-gray-800/60 text-gray-700 dark:text-gray-200"
                            >
                              {Object.keys(row).map((col) => (
                                <td key={col} className="px-2 py-1.5 whitespace-nowrap max-w-xs truncate">
                                  {String(row[col] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === "history" && (
                <div className="p-4 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                        <th className="px-2 py-2">User</th>
                        <th className="px-2 py-2">Query</th>
                        <th className="px-2 py-2">Type</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Duration</th>
                        <th className="px-2 py-2">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr
                          key={h.log_id}
                          onClick={() => {
                            setQueryText(h.query_text);
                            setTab("query");
                          }}
                          className="border-b border-gray-100 dark:border-gray-800/60 text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
                        >
                          <td className="px-2 py-1.5 whitespace-nowrap">{h.username || h.email || "—"}</td>
                          <td className="px-2 py-1.5 max-w-md truncate font-mono">{h.query_text}</td>
                          <td className="px-2 py-1.5">{h.statement_type}</td>
                          <td className="px-2 py-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                h.status === "SUCCESS"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                              }`}
                            >
                              {h.status}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">{h.execution_ms != null ? `${h.execution_ms}ms` : "—"}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {new Date(h.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {history.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-4">No queries yet</p>
                  )}
                </div>
              )}
            </ModernCard>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseManagement;
