import React, { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Download, FileSpreadsheet, Rocket, XCircle } from "lucide-react";
import Modal from "../../ui/Modal";
import { failure, sideProjectsApi, type ImportResult } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { Dropzone, primaryBtn, secondaryBtn, Spinner, STATUS_META } from "../ui";

/** Load the existing list: CSV/XLSX → dry run (every row checked) → import the valid rows. */
const ImportDialog: React.FC<{ open: boolean; onClose: () => void; onDone: () => void }> = ({ open, onClose, onDone }) => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reset = () => (setFile(null), setRes(null), setErr(null));
  const check = async (f: File) => {
    setFile(f);
    setBusy(true);
    setErr(null);
    try {
      setRes(await sideProjectsApi.importSheet(f, true));
    } catch (e) {
      setErr(failure(e).message);
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await sideProjectsApi.importSheet(file, false);
      showToast(`${r.valid} imported`, "success");
      onDone();
      reset();
      onClose();
    } catch (e) {
      setErr(failure(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={() => (reset(), onClose())} title={<span className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-600" />Import projects</span>} size="2xl">
      <div className="space-y-4">
        {!res ? (
          <>
            <Dropzone onFiles={(f) => check(f[0])} accept=".csv,.xlsx,.xls" busy={busy} progress={busy ? 60 : 0} error={err} label="Drop the list (.csv, .xlsx)" hint="registration_number · title · status · category · github_url · access_url" icon={FileSpreadsheet} />
            <a href={sideProjectsApi.templateUrl()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-200"><Download className="h-3.5 w-3.5" /> Template</a>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ["Rows", res.total, "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-white"],
                ["Ready", res.valid, "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"],
                ["Problems", res.invalid, "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"],
              ].map(([l, v, cls]) => (
                <motion.div key={String(l)} initial={{ scale: 0.9 }} animate={{ scale: 1 }} className={`rounded-2xl p-3 ${cls}`}>
                  <p className="text-2xl font-extrabold tabular-nums">{v}</p>
                  <p className="text-xs font-semibold">{l}</p>
                </motion.div>
              ))}
            </div>
            <div className="max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr><th className="px-2 py-1.5">#</th><th>Reg.</th><th>Student</th><th>Title</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {res.rows.map((r) => (
                    <tr key={r.line} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-2 py-1.5 tabular-nums text-slate-400">{r.line}</td>
                      <td className="font-mono">{r.regNumber}</td>
                      <td>{r.student ?? "—"}</td>
                      <td className="max-w-[12rem] truncate">{r.title}</td>
                      <td>{STATUS_META[r.status as keyof typeof STATUS_META]?.label ?? r.status}</td>
                      <td className="pr-2">
                        {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Ready" /> : (
                          <span className="flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4 shrink-0" aria-hidden />{r.errors.join("; ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryBtn} onClick={reset}>Another file</button>
              <button type="button" className={primaryBtn} disabled={busy || res.valid === 0} onClick={commit}>{busy ? <Spinner className="h-4 w-4" /> : <Rocket className="h-4 w-4" />} Import {res.valid}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ImportDialog;
