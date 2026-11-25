import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Link2,
  Pencil,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import Modal from "../../ui/Modal";
import { useToast } from "../../../contexts/ToastContext";
import type { BulkImportSummary, BulkRowAction, BulkRowResult, BulkSheetRow } from "../../../api/academics";
import { checkFile, ColumnSpec, downloadProblems, MAX_ROWS, parseSheet } from "./sheet";

export interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful upload, to refresh the list behind the dialog. */
  onDone: () => void;
  title: string;
  noun: { one: string; many: string };
  sheetName: string;
  columns: ColumnSpec[];
  /** Column keys shown in the review table (all columns can still be edited). */
  previewColumns: string[];
  onTemplate: () => void | Promise<void>;
  check: (rows: BulkSheetRow[]) => Promise<BulkImportSummary>;
  commit: (rows: BulkSheetRow[]) => Promise<BulkImportSummary>;
  /** Shown above the file picker (e.g. the grade to upload into). */
  setup?: React.ReactNode;
  /** False blocks choosing a file until the setup is complete. */
  ready?: boolean;
  notReadyHint?: string;
  /** Where the rows go, shown on the review step ("into SPES Year 1"). */
  contextLabel?: string;
  tips: string[];
}

type Phase = "choose" | "checking" | "review" | "saving" | "done";
type Filter = "all" | "ready" | "problems" | "skipped";

const ACTION_META: Record<BulkRowAction, { label: string; icon: React.ElementType; cls: string }> = {
  create: { label: "New", icon: PlusCircle, cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  update: { label: "Update", icon: RefreshCw, cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  assign: { label: "Link", icon: Link2, cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  skip: { label: "Skip", icon: SkipForward, cls: "bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300" },
  error: { label: "Problem", icon: XCircle, cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

const pill =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primaryBtn = `${pill} bg-blue-600 text-white hover:bg-blue-700`;
const secondaryBtn = `${pill} bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700`;

const errorMessage = (e: unknown, fallback: string) =>
  (e as any)?.response?.data?.message || (e instanceof Error && e.message) || fallback;

const readyCount = (s: BulkImportSummary) => s.create + s.update + s.assign;

const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  isOpen,
  onClose,
  onDone,
  title,
  noun,
  sheetName,
  columns,
  previewColumns,
  onTemplate,
  check,
  commit,
  setup,
  ready = true,
  notReadyHint,
  contextLabel,
  tips,
}) => {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("choose");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkSheetRow[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);
  const [result, setResult] = useState<BulkImportSummary | null>(null);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  const reset = () => {
    setPhase("choose");
    setFileName(null);
    setRows([]);
    setNotes([]);
    setFileError(null);
    setSummary(null);
    setResult(null);
    setDirty(false);
    setFilter("all");
    setEditing(null);
  };
  const close = () => {
    if (phase === "saving" || phase === "checking") return;
    reset();
    onClose();
  };

  const runCheck = async (list: BulkSheetRow[]) => {
    setPhase("checking");
    setFileError(null);
    try {
      const s = await check(list);
      setSummary(s);
      setDirty(false);
      setEditing(null);
      setFilter(s.error > 0 ? "problems" : "all");
      setPhase("review");
      if (s.error > 0) showToast(`${s.error} of ${s.total} rows need fixing`, "warning");
      else showToast(`All ${s.total} rows checked`, "success");
    } catch (e) {
      setFileError(errorMessage(e, "The rows could not be checked. Try again."));
      setPhase(summary ? "review" : "choose");
      showToast("Could not check the rows", "error");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const bad = checkFile(file);
    if (bad) {
      setFileError(bad);
      showToast("That file can't be used", "error");
      return;
    }
    try {
      const parsed = parseSheet(await file.arrayBuffer(), columns, sheetName);
      if (parsed.missingRequired.length) {
        throw new Error(
          `The sheet has no ${parsed.missingRequired.map((m) => `"${m}"`).join(" or ")} column. Use the template's headers.`,
        );
      }
      if (parsed.rows.length === 0) throw new Error(`Sheet "${parsed.sheetName}" has a header row but no ${noun.many} below it.`);
      const info: string[] = [];
      if (parsed.ignoredHeaders.length)
        info.push(`Ignored column${parsed.ignoredHeaders.length > 1 ? "s" : ""}: ${parsed.ignoredHeaders.join(", ")}`);
      if (parsed.blankRows) info.push(`${parsed.blankRows} blank row${parsed.blankRows > 1 ? "s" : ""} skipped`);
      setFileName(file.name);
      setRows(parsed.rows);
      setNotes(info);
      setSummary(null);
      await runCheck(parsed.rows);
    } catch (e) {
      setFileError(errorMessage(e, "This file can't be read."));
      showToast("That file can't be used", "error");
    }
  };

  const save = async () => {
    setPhase("saving");
    setFileError(null);
    try {
      const r = await commit(rows);
      setResult(r);
      setPhase("done");
      onDone();
      const n = readyCount(r);
      if (n === 0) showToast(`Nothing new to save: all rows were skipped or had problems`, "info");
      else showToast(`${n} ${n === 1 ? noun.one : noun.many} uploaded`, "success");
    } catch (e) {
      setFileError(errorMessage(e, "Nothing was saved. Try again."));
      setPhase("review");
      showToast("Upload failed: nothing was saved", "error");
    }
  };

  const templateClick = async () => {
    setTemplateBusy(true);
    try {
      await onTemplate();
      showToast("Template downloaded", "success");
    } catch (e) {
      showToast(errorMessage(e, "Could not build the template"), "error");
    } finally {
      setTemplateBusy(false);
    }
  };

  const editCell = (line: number, key: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.line === line ? ({ ...r, [key]: value } as BulkSheetRow) : r)));
    setDirty(true);
  };
  const removeRow = (line: number) => {
    setRows((prev) => prev.filter((r) => r.line !== line));
    setDirty(true);
    if (editing === line) setEditing(null);
  };

  const byLine = useMemo(() => new Map((summary?.rows ?? []).map((r) => [r.line, r])), [summary]);
  const visible = rows.filter((r) => {
    const res = byLine.get(r.line);
    if (!res || filter === "all") return true;
    if (filter === "problems") return res.action === "error";
    if (filter === "skipped") return res.action === "skip";
    return res.action !== "error" && res.action !== "skip";
  });
  const shownColumns = columns.filter((c) => previewColumns.includes(c.key));

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} size="3xl">
      <AnimatePresence mode="wait">
        {(phase === "choose" || (phase === "checking" && !summary)) && (
          <motion.div key="choose" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <Steps current={1} />
            {setup}

            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (ready) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (ready && phase === "choose") onFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                !ready
                  ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800/30"
                  : dragOver
                    ? "cursor-copy border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                    : "cursor-pointer border-gray-300 hover:border-blue-400 hover:bg-blue-50/40 dark:border-gray-600 dark:hover:bg-blue-500/5"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                disabled={!ready || phase === "checking"}
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {phase === "checking" ? (
                <>
                  <span className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" aria-hidden />
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Checking {rows.length} rows from {fileName}…</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Nothing is saved yet</p>
                </>
              ) : (
                <>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                    <UploadCloud className="h-6 w-6" aria-hidden />
                  </span>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {ready ? "Drop the Excel file here, or click to choose" : notReadyHint}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">.xlsx, .xls or .csv · up to {MAX_ROWS} rows · 5 MB</p>
                </>
              )}
            </label>

            {fileError && <Problem text={fileError} />}

            <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-start sm:justify-between">
              <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                {tips.map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={templateClick} disabled={templateBusy} className={`${secondaryBtn} shrink-0`}>
                {templateBusy ? <Spinner /> : <Download className="h-4 w-4" />} Download template
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2">Column</th>
                    <th className="px-3 py-2">What to write</th>
                    <th className="px-3 py-2">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {columns.map((c) => (
                    <tr key={c.key}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-800 dark:text-gray-100">
                        {c.label}
                        {c.required && <span className="ml-1 text-red-500">*</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{c.hint}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-gray-500 dark:text-gray-400">{c.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button type="button" className={secondaryBtn} onClick={close}>
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {summary && (phase === "review" || phase === "saving" || phase === "checking") && (
          <motion.div key="review" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <Steps current={2} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
                <span className="font-semibold">{fileName}</span>
                {contextLabel && <span className="text-gray-500 dark:text-gray-400">→ {contextLabel}</span>}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Checked, nothing saved yet</p>
            </div>

            <SummaryTiles s={summary} filter={filter} setFilter={setFilter} />
            {notes.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{notes.join(" · ")}</p>}

            {dirty && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" aria-hidden /> You changed rows. Check them again before uploading.
                </span>
                <button type="button" className={`${pill} bg-amber-600 py-1.5 text-white hover:bg-amber-700`} onClick={() => runCheck(rows)} disabled={phase !== "review"}>
                  {phase === "checking" ? <Spinner /> : <RotateCcw className="h-4 w-4" />} Check again
                </button>
              </div>
            )}

            <div className="max-h-[45vh] overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Status</th>
                    {shownColumns.map((c) => (
                      <th key={c.key} className="px-3 py-2">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-2">Details</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {phase === "checking"
                    ? Array.from({ length: Math.min(6, rows.length) }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: shownColumns.length + 4 }).map((__, j) => (
                            <td key={j} className="px-3 py-3">
                              <div className="h-3 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : visible.map((row) => (
                        <ReviewRow
                          key={row.line}
                          row={row}
                          res={byLine.get(row.line)}
                          stale={dirty}
                          columns={columns}
                          shownColumns={shownColumns}
                          editing={editing === row.line}
                          busy={phase !== "review"}
                          onEdit={() => setEditing(editing === row.line ? null : row.line)}
                          onChange={(k, v) => editCell(row.line, k, v)}
                          onRemove={() => removeRow(row.line)}
                        />
                      ))}
                  {phase !== "checking" && visible.length === 0 && (
                    <tr>
                      <td colSpan={shownColumns.length + 4} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                        No rows in this view
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {phase === "saving" && (
              <div className="space-y-1.5" role="status">
                <div className="h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-500/20">
                  <motion.div
                    className="h-full w-1/3 rounded-full bg-blue-600"
                    animate={{ x: ["-100%", "300%"] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Saving {readyCount(summary)} {noun.many}… keep this window open</p>
              </div>
            )}
            {fileError && <Problem text={fileError} />}

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" className={secondaryBtn} onClick={reset} disabled={phase !== "review"}>
                <ArrowLeft className="h-4 w-4" /> Choose another file
              </button>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                {summary.error > 0 && !dirty && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {summary.error} row{summary.error > 1 ? "s" : ""} with problems will be left out
                  </span>
                )}
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={save}
                  disabled={phase !== "review" || dirty || readyCount(summary) === 0}
                  title={dirty ? "Check the changed rows first" : undefined}
                >
                  {phase === "saving" ? <Spinner light /> : <UploadCloud className="h-4 w-4" />}
                  {readyCount(summary) === 0
                    ? "Nothing to upload"
                    : `Upload ${readyCount(summary)} ${readyCount(summary) === 1 ? noun.one : noun.many}`}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "done" && result && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5">
            <Steps current={3} />
            <div className="flex flex-col items-center gap-2 text-center">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
              >
                <CheckCircle2 className="h-7 w-7" aria-hidden />
              </motion.span>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {readyCount(result) > 0 ? "Upload complete" : "Nothing new was saved"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {fileName}
                {contextLabel ? ` → ${contextLabel}` : ""}
              </p>
            </div>
            <SummaryTiles s={result} />
            {result.error > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {result.error} row{result.error > 1 ? "s were" : " was"} left out. Download them with the reason, fix, and upload again.
                </span>
                <button
                  type="button"
                  className={`${pill} shrink-0 bg-white text-red-700 hover:bg-red-100 dark:bg-gray-900 dark:text-red-300`}
                  onClick={() => {
                    downloadProblems({
                      fileName: `${sheetName.toLowerCase()}-to-fix.xlsx`,
                      sheetName,
                      columns,
                      rows,
                      results: result.rows,
                    });
                    showToast("Rows with problems downloaded", "success");
                  }}
                >
                  <Download className="h-4 w-4" /> Rows to fix
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button type="button" className={secondaryBtn} onClick={reset}>
                <UploadCloud className="h-4 w-4" /> Upload another file
              </button>
              <button type="button" className={primaryBtn} onClick={close}>
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
};

const Spinner: React.FC<{ light?: boolean }> = ({ light }) => (
  <span
    className={`h-4 w-4 animate-spin rounded-full border-2 ${light ? "border-white/40 border-t-white" : "border-blue-200 border-t-blue-600"}`}
    aria-hidden
  />
);

const Problem: React.FC<{ text: string }> = ({ text }) => (
  <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
    <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
    {text}
  </p>
);

const Steps: React.FC<{ current: 1 | 2 | 3 }> = ({ current }) => (
  <ol className="flex items-center gap-2 text-xs font-medium">
    {["Choose file", "Review & fix", "Done"].map((label, i) => {
      const n = i + 1;
      const state = n < current ? "done" : n === current ? "now" : "next";
      return (
        <React.Fragment key={label}>
          {i > 0 && <span className={`h-px flex-1 ${n <= current ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"}`} />}
          <li className={`flex items-center gap-1.5 ${state === "next" ? "text-gray-400 dark:text-gray-500" : "text-blue-700 dark:text-blue-300"}`}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                state === "next" ? "bg-gray-100 dark:bg-gray-800" : "bg-blue-600 text-white"
              }`}
            >
              {state === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
            </span>
            {label}
          </li>
        </React.Fragment>
      );
    })}
  </ol>
);

const SummaryTiles: React.FC<{ s: BulkImportSummary; filter?: Filter; setFilter?: (f: Filter) => void }> = ({ s, filter, setFilter }) => {
  const tiles: { key: Filter; label: string; value: number; cls: string }[] = [
    { key: "all", label: "Rows", value: s.total, cls: "text-gray-900 dark:text-white" },
    { key: "ready", label: s.dryRun ? "Ready" : "Saved", value: s.create + s.update + s.assign, cls: "text-blue-700 dark:text-blue-300" },
    { key: "skipped", label: "Skipped", value: s.skip, cls: "text-gray-600 dark:text-gray-300" },
    { key: "problems", label: s.dryRun ? "Problems" : "Left out", value: s.error, cls: "text-red-600 dark:text-red-400" },
  ];
  const parts = [
    s.create && `${s.create} new`,
    s.update && `${s.update} updated`,
    s.assign && `${s.assign} linked`,
  ].filter(Boolean);
  const pct = s.total ? Math.round(((s.create + s.update + s.assign + s.skip) / s.total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t, i) => {
          const active = filter === t.key;
          const Tag = setFilter ? "button" : "div";
          return (
            <motion.div key={t.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Tag
                {...(setFilter ? { type: "button", onClick: () => setFilter(t.key), "aria-pressed": active } : {})}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                  active
                    ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10"
                    : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/40"
                } ${setFilter ? "hover:border-blue-300 dark:hover:border-blue-500/60" : ""}`}
              >
                <p className={`text-2xl font-bold tabular-nums ${t.cls}`}>{t.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t.label}</p>
              </Tag>
            </motion.div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-red-100 dark:bg-red-500/20" role="img" aria-label={`${pct}% of rows fine`}>
          <motion.div className="h-full rounded-full bg-blue-600" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
        </div>
        {parts.length > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{parts.join(" · ")}</span>}
      </div>
    </div>
  );
};

const ReviewRow: React.FC<{
  row: BulkSheetRow;
  res?: BulkRowResult;
  stale: boolean;
  columns: ColumnSpec[];
  shownColumns: ColumnSpec[];
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onChange: (key: string, value: string) => void;
  onRemove: () => void;
}> = ({ row, res, stale, columns, shownColumns, editing, busy, onEdit, onChange, onRemove }) => {
  const meta = res ? ACTION_META[res.action] : null;
  const Icon = meta?.icon;
  const isError = res?.action === "error";
  return (
    <>
      <tr className={isError ? "bg-red-50/40 dark:bg-red-500/5" : ""}>
        <td className="px-3 py-2 align-top tabular-nums text-gray-400">{row.line}</td>
        <td className="px-3 py-2 align-top">
          {meta && Icon && (
            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls} ${stale ? "opacity-50" : ""}`}>
              <Icon className="h-3 w-3" aria-hidden /> {meta.label}
            </span>
          )}
        </td>
        {shownColumns.map((c) => (
          <td key={c.key} className="max-w-[12rem] truncate px-3 py-2 align-top text-gray-700 dark:text-gray-200" title={row[c.key]}>
            {row[c.key] || <span className="text-gray-300 dark:text-gray-600">—</span>}
          </td>
        ))}
        <td className="min-w-[16rem] px-3 py-2 align-top">
          {res?.errors.map((e) => (
            <p key={e} className="flex items-start gap-1 text-red-600 dark:text-red-400">
              <XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {e}
            </p>
          ))}
          {res?.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {w}
            </p>
          ))}
          {!isError &&
            res?.changes.map((c) => (
              <p key={c} className="text-gray-500 dark:text-gray-400">
                {c}
              </p>
            ))}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right align-top">
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              editing ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
            }`}
            aria-label={`Edit row ${row.line}`}
            title="Edit this row"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
            aria-label={`Remove row ${row.line}`}
            title="Leave this row out"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="bg-blue-50/40 dark:bg-blue-500/5">
          <td colSpan={shownColumns.length + 4} className="px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {columns.map((c) => (
                <label key={c.key} className="space-y-1">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    {c.label}
                    {c.required && <span className="ml-0.5 text-red-500">*</span>}
                  </span>
                  <input
                    value={row[c.key] ?? ""}
                    onChange={(e) => onChange(c.key, e.target.value)}
                    placeholder={c.example}
                    className="w-full rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default BulkUploadModal;
