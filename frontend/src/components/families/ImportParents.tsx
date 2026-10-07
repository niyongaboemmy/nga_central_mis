import React, { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import { familiesApi, parseImport, type ImportResult } from "../../api/families";
import { Card, CardTitle, Muted, inputCls, labelCls, primaryBtn } from "../officeHours/ohUi";
import { useToast } from "../../contexts/ToastContext";

const OUTCOME: Record<ImportResult["outcome"], { label: string; cls: string }> = {
  created: { label: "Account created", cls: "text-emerald-700 dark:text-emerald-300" },
  linked: { label: "Linked to existing parent", cls: "text-blue-700 dark:text-blue-300" },
  already_linked: { label: "Already linked", cls: "text-slate-600 dark:text-gray-300" },
  error: { label: "Not imported", cls: "text-rose-700 dark:text-rose-300" },
};

/**
 * For registrars (Manage users): paste a list of parents and their children.
 * Each parent gets an account (the usual email with a temporary password) and
 * is linked to the child; an existing parent is linked to another child.
 */
const ImportParents: React.FC = () => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const rows = useMemo(() => parseImport(text), [text]);
  const { showToast } = useToast();
  const run = async () => {
    setBusy(true);
    try {
      setResults((await familiesApi.importParents(rows)).data.data);
    } catch (e) {
      showToast(apiError(e, "Couldn't import."), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <UserPlus className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> Import parents
        </h1>
        <Muted className="mt-1">One line per parent and child: student (registration number, username, email or id), parent's name, parent's email, phone (optional), relationship (mother, father, guardian; optional). Paste from a spreadsheet.</Muted>
      </header>
      <Card labelledBy="imp-input">
        <CardTitle id="imp-input">List</CardTitle>
        <label htmlFor="imp-text" className={labelCls}>Parents</label>
        <textarea id="imp-text" className={`${inputCls} font-mono`} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"NGA2026001, Marie Uwase, marie@example.com, +250788000111, mother"} />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={primaryBtn} disabled={busy || rows.length === 0} onClick={() => void run()}>Import {rows.length} row{rows.length === 1 ? "" : "s"}</button>
          <Muted>Each new parent receives an email with a temporary password.</Muted>
        </div>
      </Card>
      {results && (
        <Card labelledBy="imp-results">
          <CardTitle id="imp-results">Result</CardTitle>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-gray-700/40" data-testid="imp-results">
            {results.map((r) => (
              <li key={r.row} className="flex flex-wrap gap-2 py-1.5">
                <span className="w-14 text-slate-600 dark:text-gray-300">Row {r.row}</span>
                <span className="min-w-0 flex-1 text-slate-900 dark:text-white">{rows[r.row - 1]?.parentName} → {rows[r.row - 1]?.student}</span>
                <span className={`font-semibold ${OUTCOME[r.outcome].cls}`}>{OUTCOME[r.outcome].label}{r.message ? `: ${r.message}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

export default ImportParents;
