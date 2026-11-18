import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Rocket, Rows3, XCircle } from "lucide-react";
import { failure, sideProjectsApi, type ImportResult } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { FormModal } from "../form";
import { Dropzone, primaryBtn, secondaryBtn, Spinner, STATUS_META } from "../ui";

/** Load the existing list: CSV/XLSX → dry run (every row checked) → import the valid rows. */
const ImportDialog: React.FC<{ open: boolean; onClose: () => void; onDone: () => void }> = ({ open, onClose, onDone }) => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reset = () => (setFile(null), setRes(null), setErr(null));
  const close = () => (reset(), onClose());
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
      close();
    } catch (e) {
      setErr(failure(e).message);
    } finally {
      setBusy(false);
    }
  };
  const pct = res && res.total ? Math.round((res.valid / res.total) * 100) : 0;

  return (
    <FormModal
      open={open}
      onClose={close}
      busy={busy}
      size="lg"
      icon={FileSpreadsheet}
      tone={["#047857", "#10b981"]}
      title="Import projects"
      subtitle={res ? `${file?.name} · checked, nothing saved yet` : "Load an existing list from Excel or CSV"}
      footer={
        res ? (
          <>
            <button type="button" className={secondaryBtn} onClick={reset} disabled={busy}>
              <ArrowLeft className="h-4 w-4" /> Another file
            </button>
            <button type="button" className={primaryBtn} disabled={busy || res.valid === 0} onClick={commit}>
              {busy ? <Spinner className="h-4 w-4" /> : <Rocket className="h-4 w-4" />} Import {res.valid} project{res.valid === 1 ? "" : "s"}
            </button>
          </>
        ) : (
          <>
            <a href={sideProjectsApi.templateUrl()} className={secondaryBtn}>
              <Download className="h-4 w-4" /> Template
            </a>
            <button type="button" className={secondaryBtn} onClick={close}>
              Cancel
            </button>
          </>
        )
      }
    >
      {!res ? (
        <div className="space-y-4">
          <Dropzone onFiles={(f) => check(f[0])} accept=".csv,.xlsx,.xls" busy={busy} progress={busy ? 60 : 0} error={err} label="Drop the list here" hint="or click to browse · .csv or .xlsx" icon={FileSpreadsheet} />
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["1", "registration_number or email", "who owns it"],
              ["2", "title · status · category", "the project"],
              ["3", "github_url · access_url", "optional links"],
            ].map(([n, cols, what]) => (
              <div key={n} className="flex items-start gap-2.5 rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/40">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">{n}</span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px] text-slate-700 dark:text-gray-200">{cols}</span>
                  <span className="text-[11px] text-slate-500 dark:text-gray-400">{what}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {([
              ["Rows", res.total, Rows3, "bg-slate-50 text-slate-800 dark:bg-gray-800/40 dark:text-white", "text-slate-500"],
              ["Ready", res.valid, CheckCircle2, "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200", "text-emerald-600"],
              ["Problems", res.invalid, XCircle, "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300", "text-red-500"],
            ] as const).map(([l, v, Icon, cls, ic], i) => (
              <motion.div key={l} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className={`rounded-3xl p-4 ${cls}`}>
                <Icon className={`h-5 w-5 ${ic}`} aria-hidden />
                <p className="mt-2 text-2xl font-extrabold tabular-nums">{v}</p>
                <p className="text-xs font-semibold">{l}</p>
              </motion.div>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-red-100 dark:bg-red-500/20" role="img" aria-label={`${pct}% of rows ready`}>
            <motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
          </div>
          <div className="max-h-72 overflow-auto rounded-2xl border border-slate-200 dark:border-gray-700/40">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-700/40">
                {res.rows.map((r) => (
                  <tr key={r.line} className={r.ok ? "" : "bg-red-50/50 dark:bg-red-500/5"}>
                    <td className="px-3 py-2 tabular-nums text-slate-400">{r.line}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800 dark:text-gray-100">{r.student ?? "—"}</p>
                      <p className="font-mono text-[10px] text-slate-500 dark:text-gray-400">{r.regNumber}</p>
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-slate-700 dark:text-gray-200">{r.title}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-gray-300">{STATUS_META[r.status as keyof typeof STATUS_META]?.label ?? r.status}</td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Ready" />
                      ) : (
                        <span className="flex items-start gap-1 text-red-600 dark:text-red-400">
                          <XCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
                          {r.errors.join("; ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {err && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>}
        </div>
      )}
    </FormModal>
  );
};

export default ImportDialog;
