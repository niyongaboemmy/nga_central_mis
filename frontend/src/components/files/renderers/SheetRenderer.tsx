import React, { useEffect, useState } from "react";

const MAX_ROWS = 500;
const MAX_COLS = 40;

/**
 * Read-only spreadsheet view (SheetJS CE 0.20 from the SheetJS CDN — the npm 0.18 build is
 * frozen with known advisories): sheet tabs, the first 500 rows, values as text only — never
 * formulas or HTML. Lazy-loaded.
 */
const SheetRenderer: React.FC<{ blob: Blob; onError: (m: string) => void }> = ({ blob, onError }) => {
  const [sheets, setSheets] = useState<{ name: string; rows: string[][]; truncated: boolean }[] | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await blob.arrayBuffer(), { type: "array", sheetRows: MAX_ROWS + 1, cellHTML: false });
        const out = wb.SheetNames.slice(0, 12).map((name) => {
          const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: false, blankrows: false, defval: "" });
          return { name, rows: rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => String(c ?? ""))), truncated: rows.length > MAX_ROWS };
        });
        if (!off) setSheets(out);
      } catch {
        if (!off) onError("This spreadsheet couldn't be shown here.");
      }
    })();
    return () => {
      off = true;
    };
  }, [blob, onError]);
  if (!sheets) return <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10" aria-busy="true" />;
  const sheet = sheets[active];
  return <SheetTable sheets={sheets.map((s) => s.name)} active={active} onPick={setActive} rows={sheet?.rows ?? []} truncated={!!sheet?.truncated} />;
};

export const SheetTable: React.FC<{ sheets?: string[]; active?: number; onPick?: (i: number) => void; rows: string[][]; truncated?: boolean }> = ({ sheets, active = 0, onPick, rows, truncated }) => (
  <div>
    {sheets && sheets.length > 1 && (
      <div className="flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label="Sheets">
        {sheets.map((n, i) => (
          <button key={n} role="tab" aria-selected={i === active} onClick={() => onPick?.(i)} className={`min-h-[34px] px-3 rounded-lg text-xs font-medium whitespace-nowrap ${i === active ? "el-segment-on" : "el-chip"}`}>
            {n}
          </button>
        ))}
      </div>
    )}
    <div tabIndex={0} role="region" aria-label="Spreadsheet preview" className="max-h-[70vh] overflow-auto focus:outline-none focus-visible:shadow-glow rounded-xl border border-gray-200 dark:border-white/10">
      <table className="min-w-full text-xs">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i === 0 ? "bg-gray-50 dark:bg-white/[0.04] font-semibold sticky top-0" : "border-t border-gray-100 dark:border-white/[0.06]"}>
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1.5 whitespace-nowrap text-gray-800 dark:text-gray-100">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {truncated && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Showing the first {MAX_ROWS} rows — download the file for the rest.</p>}
  </div>
);

export default SheetRenderer;
