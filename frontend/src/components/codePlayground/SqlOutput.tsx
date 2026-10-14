import React, { useState } from "react";
import { Check, Copy, Table2 } from "lucide-react";

/**
 * SQL results as tables. The runner prints each result set the way `sqlite3 -box` does:
 *
 *   ┌────────────┬───────┐
 *   │    name    │ price │
 *   ├────────────┼───────┤
 *   │ Brake pad  │ 12000 │
 *   └────────────┴───────┘
 *
 * Box-drawing characters don't join up in a web page's line spacing, so each one becomes a
 * real table; anything else printed (messages, .print output) stays text.
 */
export type SqlPart =
  | { kind: "text"; text: string }
  | { kind: "table"; columns: string[]; rows: string[][] };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^│|│$/g, "")
    .split("│")
    .map((c) => c.trim());

export function parseSqlOutput(out: string): SqlPart[] {
  const parts: SqlPart[] = [];
  const lines = out.replace(/\r\n?/g, "\n").split("\n");
  let text: string[] = [];
  const flushText = () => {
    const t = text.join("\n").replace(/^\n+|\n+$/g, "");
    if (t) parts.push({ kind: "text", text: t });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trimStart().startsWith("┌")) {
      text.push(lines[i]);
      continue;
    }
    // A table: header row, ├ separator, data rows, └ bottom.
    let j = i + 1;
    const header = lines[j]?.trimStart().startsWith("│")
      ? cells(lines[j])
      : null;
    const sep = lines[j + 1]?.trimStart().startsWith("├");
    if (!header || !sep) {
      text.push(lines[i]);
      continue;
    }
    j += 2;
    const rows: string[][] = [];
    while (j < lines.length && lines[j].trimStart().startsWith("│"))
      rows.push(cells(lines[j++]));
    if (!lines[j]?.trimStart().startsWith("└")) {
      // Not a table after all (cut off output): keep it as printed.
      text.push(...lines.slice(i, j));
      i = j - 1;
      continue;
    }
    flushText();
    parts.push({ kind: "table", columns: header, rows });
    i = j;
  }
  flushText();
  return parts;
}

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
export const toCsv = (columns: string[], rows: string[][]) =>
  [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

const NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;

const ResultTable: React.FC<{
  columns: string[];
  rows: string[][];
  index: number;
}> = ({ columns, rows, index }) => {
  const [copied, setCopied] = useState(false);
  const numeric = columns.map(
    (_, c) =>
      rows.length > 0 &&
      rows.every((r) => r[c] === "" || NUMBER.test(r[c] ?? "")),
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(columns, rows));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the table is selectable */
    }
  };
  return (
    <figure
      className="my-2 rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden font-sans"
      data-testid="playground-sql-table"
    >
      <figcaption className="flex items-center gap-2 h-8 px-2.5 bg-slate-50 dark:bg-white/[0.04] border-b border-slate-200 dark:border-white/10 text-[11.5px] text-slate-600 dark:text-slate-300">
        <Table2 className="w-3.5 h-3.5" aria-hidden />
        <span className="font-semibold">Result {index + 1}</span>
        <span>
          · {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 h-6 px-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-white/10"
          title="Copy as CSV (pastes into a spreadsheet)"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-success-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}{" "}
          {copied ? "Copied" : "CSV"}
        </button>
      </figcaption>
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full text-[12.5px] border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-[#161b22] shadow-[0_1px_0_rgb(0_0_0/0.08)] dark:shadow-[0_1px_0_rgb(255_255_255/0.08)]">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`px-2.5 py-1.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap ${numeric[i] ? "text-right" : "text-left"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr
                key={ri}
                className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-transparent dark:even:bg-white/[0.03] hover:bg-brand-50/60 dark:hover:bg-brand-500/10"
              >
                {columns.map((_, ci) => (
                  <td
                    key={ci}
                    className={`px-2.5 py-1 font-mono text-slate-800 dark:text-slate-100 whitespace-pre ${numeric[ci] ? "text-right tabular-nums" : "text-left"}`}
                  >
                    {r[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-2.5 py-2 text-slate-500 dark:text-slate-400 italic"
                >
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

/** One run's printed output, with its result sets as tables. */
const SqlOutput: React.FC<{ text: string }> = ({ text }) => {
  const parts = parseSqlOutput(text);
  let t = -1;
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "table" ? (
          <ResultTable
            key={i}
            columns={p.columns}
            rows={p.rows}
            index={(t += 1)}
          />
        ) : (
          <div
            key={i}
            className="whitespace-pre-wrap break-words py-0.5 text-slate-800 dark:text-slate-100"
          >
            {p.text}
          </div>
        ),
      )}
    </>
  );
};

export default SqlOutput;
