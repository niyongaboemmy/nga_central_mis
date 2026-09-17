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
  Sparkles,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
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
  generateSqlWithAI,
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

const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`animate-pulse bg-gray-200 dark:bg-gray-800 rounded ${className}`} />
);

const TableListSkeleton: React.FC = () => (
  <div className="space-y-2">
    {Array.from({ length: 8 }).map((_, i) => (
      <Skeleton key={i} className="h-8 w-full rounded-lg" />
    ))}
  </div>
);

const DataTableSkeleton: React.FC<{ cols?: number; rowsCount?: number }> = ({
  cols = 5,
  rowsCount = 8,
}) => (
  <div className="space-y-2">
    <div className="flex gap-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1 min-w-[100px]" />
      ))}
    </div>
    {Array.from({ length: rowsCount }).map((_, r) => (
      <div key={r} className="flex gap-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-6 flex-1 min-w-[100px]" />
        ))}
      </div>
    ))}
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

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
};

const DatabaseManagement: React.FC = () => {
  const { user, isLoading } = useUser();
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
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
  const [rowSearch, setRowSearch] = useState("");
  const debouncedRowSearch = useDebouncedValue(rowSearch, 400);

  const [structure, setStructure] = useState<{ columns: ColumnInfo[]; indexes: IndexInfo[] } | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  const [queryText, setQueryText] = useState("SELECT * FROM ");
  const [queryResult, setQueryResult] = useState<{ rows: any[]; rowCount: number; executionMs: number; statementType: string; affectedRows?: number } | null>(null);
  const [queryRunning, setQueryRunning] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiNote, setAiNote] = useState<{ explanation: string | null; providerUsed: string } | null>(null);

  const [history, setHistory] = useState<QueryLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
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
    setTablesLoading(true);
    getTables()
      .then(setTables)
      .catch(() => showToast("Failed to load tables", "error"))
      .finally(() => setTablesLoading(false));
    getServerStatus().then(setStatus).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const loadTableData = async (table: string, pageNum = 1, search = rowSearch) => {
    setBrowseLoading(true);
    try {
      const data = await getTableData(table, { page: pageNum, limit, sortBy, sortDir, search });
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
    setRowSearch("");
    setStructureLoading(true);
    await loadTableData(table, 1, "");
    try {
      const s = await getTableStructure(table);
      setStructure(s);
    } catch {
      setStructure(null);
    } finally {
      setStructureLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedTable || tab !== "browse") return;
    loadTableData(selectedTable, 1, debouncedRowSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir, debouncedRowSearch]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await getQueryHistory({ page: 1, limit: 50 });
      setHistory(res.data);
    } catch {
      showToast("Failed to load query history", "error");
    } finally {
      setHistoryLoading(false);
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

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiNote(null);
    try {
      const result = await generateSqlWithAI(aiPrompt.trim(), selectedTable || undefined);
      setQueryText(result.sql);
      setAiNote({ explanation: result.explanation, providerUsed: result.providerUsed });
      showToast("SQL query drafted — review before running", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "AI could not generate a query", "error");
    } finally {
      setAiGenerating(false);
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

  const SortIcon = ({ col }: { col: string }) =>
    sortBy !== col ? (
      <ArrowUpDown className="w-3 h-3 text-gray-400 inline ml-1" />
    ) : sortDir === "ASC" ? (
      <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400 inline ml-1" />
    );

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      {/* Top bar */}
      <ModernCard className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
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
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            Session expires in {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
          <button
            onClick={() => setWriteMode((w) => !w)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" />
            Lock
          </button>
        </div>
      </ModernCard>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Tables panel */}
        <ModernCard className="p-3 h-fit lg:sticky lg:top-4">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search tables..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => {
              setSelectedTable(null);
              setTab("query");
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mb-2 transition-colors ${
              tab === "query" || tab === "history"
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
            }`}
          >
            <Play className="w-4 h-4" />
            SQL Query
          </button>
          <div className="max-h-[55vh] overflow-y-auto overflow-x-hidden space-y-1">
            {tablesLoading ? (
              <TableListSkeleton />
            ) : (
              filteredTables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => selectTable(t.name)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTable === t.name
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <TableIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.name}</span>
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{t.rows ?? "-"}</span>
                </button>
              ))
            )}
            {!tablesLoading && filteredTables.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-4">No tables found</p>
            )}
          </div>
        </ModernCard>

        {/* Main panel */}
        <div className="space-y-4 min-w-0">
          {selectedTable && (
            <ModernCard className="p-0 overflow-hidden">
              <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
                {(["browse", "structure", "export"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors whitespace-nowrap ${
                      tab === t
                        ? "border-blue-600 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "browse" && (
                <div className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {selectedTable} <span className="text-gray-400 font-normal">({total} rows)</span>
                    </h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          value={rowSearch}
                          onChange={(e) => setRowSearch(e.target.value)}
                          placeholder="Search rows..."
                          className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                        />
                      </div>
                      <button
                        onClick={() => selectedTable && loadTableData(selectedTable, page)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                        title="Refresh"
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
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add row
                        </button>
                      )}
                    </div>
                  </div>

                  {newRow && (
                    <ModernCard className="p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                          New row
                        </span>
                        <button onClick={() => setNewRow(null)}>
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {Object.keys(newRow).map((col) => (
                          <input
                            key={col}
                            value={newRow[col]}
                            onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
                            placeholder={col}
                            className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleAddRow}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Save row
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

                  {browseLoading ? (
                    <DataTableSkeleton cols={Math.max(4, structure?.columns.length || 5)} />
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
                      <div className="max-h-[55vh] overflow-y-auto">
                        <table className="min-w-full text-xs">
                          <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                              {rows[0] &&
                                Object.keys(rows[0]).map((col) => (
                                  <th
                                    key={col}
                                    onClick={() => {
                                      setSortDir(sortBy === col && sortDir === "ASC" ? "DESC" : "ASC");
                                      setSortBy(col);
                                    }}
                                    className="px-2 py-2 cursor-pointer whitespace-nowrap select-none hover:text-gray-700 dark:hover:text-gray-200"
                                  >
                                    {col}
                                    <SortIcon col={col} />
                                  </th>
                                ))}
                              {writeMode && <th className="px-2 py-2" />}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, i) => (
                              <tr
                                key={i}
                                className="border-b border-gray-100 dark:border-gray-800/60 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/40"
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
                                        className="w-full bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-blue-400 rounded px-1"
                                      />
                                    ) : (
                                      String(row[col] ?? "")
                                    )}
                                  </td>
                                ))}
                                {writeMode && (
                                  <td className="px-2 py-1.5">
                                    <button onClick={() => handleDeleteRow(row)} title="Delete row">
                                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {rows.length === 0 && (
                        <p className="text-center text-xs text-gray-400 py-6">No rows</p>
                      )}
                    </div>
                  )}

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

              {tab === "structure" &&
                (structureLoading ? (
                  <div className="p-4">
                    <DataTableSkeleton cols={6} rowsCount={6} />
                  </div>
                ) : structure ? (
                  <div className="p-4 space-y-4">
                    <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
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
                              <td className="px-2 py-1.5 font-medium whitespace-nowrap">{c.name}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{c.type}</td>
                              <td className="px-2 py-1.5">{c.isNullable}</td>
                              <td className="px-2 py-1.5">{c.columnKey}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{c.defaultValue ?? "—"}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{c.extra}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-2">
                        Indexes
                      </h3>
                      <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
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
                                <td className="px-2 py-1.5 whitespace-nowrap">{idx.name}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{idx.column_name}</td>
                                <td className="px-2 py-1.5">{idx.nonUnique === 0 ? "Yes" : "No"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-xs text-gray-400 py-6">Structure unavailable</p>
                ))}

              {tab === "export" && (
                <div className="p-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => selectedTable && exportTable(selectedTable, "csv")}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
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
              <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
                {(["query", "history"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-3 text-sm font-medium capitalize border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      tab === t
                        ? "border-blue-600 text-blue-600 dark:text-blue-400"
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
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Query editor
                    </span>
                    <button
                      onClick={() => setAiPanelOpen((o) => !o)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        aiPanelOpen
                          ? "bg-blue-600 text-white"
                          : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Ask AI to write SQL
                    </button>
                  </div>

                  {aiPanelOpen && (
                    <ModernCard className="p-3 space-y-2 bg-blue-50/40 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/40">
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={
                          selectedTable
                            ? `Describe the query, e.g. "show the 10 most recent rows in ${selectedTable}"`
                            : 'Describe the query, e.g. "list the 10 students with the highest average grade this term"'
                        }
                        rows={2}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          Drafts a query for you to review — it never runs automatically.
                        </span>
                        <button
                          onClick={handleAiGenerate}
                          disabled={aiGenerating || !aiPrompt.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {aiGenerating ? "Generating..." : "Generate SQL"}
                        </button>
                      </div>
                      {aiNote && (
                        <p className="text-[11px] text-blue-700 dark:text-blue-300 border-t border-blue-100 dark:border-blue-900/40 pt-2">
                          {aiNote.explanation || "Query drafted."}{" "}
                          <span className="text-gray-400">(via {aiNote.providerUsed})</span>
                        </p>
                      )}
                    </ModernCard>
                  )}

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
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex-wrap">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        This looks like a{" "}
                        <strong>{classifyClientSide(queryText).statementType}</strong> statement.
                        Confirm to run it.
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => executeQuery(true)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white"
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

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => executeQuery(false)}
                      disabled={queryRunning || !queryText.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
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

                  {queryRunning && (
                    <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-3">
                      <DataTableSkeleton cols={5} rowsCount={4} />
                    </div>
                  )}

                  {!queryRunning && queryResult && queryResult.rows.length > 0 && (
                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-xl">
                      <div className="max-h-[45vh] overflow-y-auto">
                        <table className="min-w-full text-xs">
                          <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
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
                    </div>
                  )}
                </div>
              )}

              {tab === "history" && (
                <div className="p-4">
                  {historyLoading ? (
                    <DataTableSkeleton cols={6} />
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
                      <div className="max-h-[60vh] overflow-y-auto">
                        <table className="min-w-full text-xs">
                          <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
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
                                <td className="px-2 py-1.5 whitespace-nowrap">{h.statement_type}</td>
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
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  {h.execution_ms != null ? `${h.execution_ms}ms` : "—"}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  {new Date(h.created_at).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {history.length === 0 && (
                        <p className="text-center text-xs text-gray-400 py-6">No queries yet</p>
                      )}
                    </div>
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
