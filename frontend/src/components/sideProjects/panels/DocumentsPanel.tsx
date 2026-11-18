import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, Eye, History, Lock, RefreshCw, Sparkles } from "lucide-react";
import { failure, fileUrl, sideProjectsApi, type DocType, type DocVersion, type ProjectDetail } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import FilePreview, { type PreviewManifest } from "../../files/FilePreview";
import Modal from "../../ui/Modal";
import { DOC_META, Dropzone, fmtBytes, ghostBtn, Skeleton, Spinner, timeAgo, cardCls } from "../ui";

const ACCEPT: Record<DocType, string> = {
  CONCEPT: ".pdf,.doc,.docx,.odt,.md,.txt,.ppt,.pptx",
  SRS: ".pdf,.doc,.docx,.odt,.md,.txt",
  IMPLEMENTATION_PLAN: ".pdf,.doc,.docx,.odt,.md,.txt,.xls,.xlsx,.ods,.ppt,.pptx",
};
const TEMPLATE: Record<DocType, string> = {
  CONCEPT: "/templates/projects/concept-note.md",
  SRS: "/templates/projects/srs.md",
  IMPLEMENTATION_PLAN: "/templates/projects/implementation-plan.md",
};

/** Preview any stored project file through the shared FilePreview (PDF pages, Word, sheets, text). */
export const AssetPreview: React.FC<{ assetId: number; name: string }> = ({ assetId, name }) => {
  const [manifest, setManifest] = useState<PreviewManifest | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setManifest(null);
    setErr(null);
    sideProjectsApi.manifest(assetId).then(setManifest).catch((e) => setErr(failure(e).message));
  }, [assetId]);
  const load = useCallback((v: "original" | "pdf" | "text") => sideProjectsApi.blob(assetId, v), [assetId]);
  if (err) return <p className="p-6 text-center text-sm text-red-600">{err}</p>;
  if (!manifest) return <Skeleton className="h-96 w-full" />;
  return (
    <FilePreview
      manifest={manifest}
      loadVariant={load}
      refreshManifest={() => sideProjectsApi.manifest(assetId)}
      onDownload={() => window.open(fileUrl(assetId, "original", true), "_blank", "noopener,noreferrer")}
      mediaUrl={fileUrl(assetId)}
      key={name}
    />
  );
};

const Slot: React.FC<{ type: DocType; slot: { current: DocVersion | null; versions: DocVersion[] }; canEdit: boolean; pending: boolean; projectId: number; onChanged: () => void; onPreview: (d: DocVersion) => void }> = ({
  type, slot, canEdit, pending, projectId, onChanged, onPreview,
}) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const M = DOC_META[type];
  const cur = slot.current;
  const upload = async (files: File[]) => {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const r = await sideProjectsApi.uploadDocument(projectId, type, files[0], setProgress);
      showToast(`${M.label} v${r.version}`, "success");
      onChanged();
    } catch (e) {
      setError(failure(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div layout className={`${cardCls} overflow-hidden`}>
      <div className="flex items-center gap-3 p-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${cur ? "bg-emerald-500 text-white" : pending ? "bg-red-500 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-700"}`}>
          <M.icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white">
            {M.label}
            {M.required && <Lock className="h-3 w-3 text-slate-400" aria-label="Required" />}
            {cur && <span className="rounded-md bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">v{cur.version}</span>}
            {cur?.source === "WRITTEN" && <Sparkles className="h-3 w-3 text-brand-500" aria-label="Written in the form" />}
          </p>
          {cur ? (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{cur.name} · {fmtBytes(cur.size)} · {timeAgo(cur.createdAt)}</p>
          ) : (
            <a href={TEMPLATE[type]} download className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-200">Template</a>
          )}
        </div>
        {cur && (
          <div className="flex items-center gap-1">
            <button type="button" className={ghostBtn} onClick={() => onPreview(cur)} aria-label={`Preview ${M.label}`}><Eye className="h-4 w-4" /></button>
            <a className={ghostBtn} href={fileUrl(cur.assetId, "original", true)} aria-label={`Download ${M.label}`}><Download className="h-4 w-4" /></a>
            {slot.versions.length > 1 && (
              <button type="button" className={ghostBtn} onClick={() => setShowVersions((s) => !s)} aria-expanded={showVersions} aria-label="Versions">
                <History className="h-4 w-4" /><span className="text-xs">{slot.versions.length}</span>
              </button>
            )}
          </div>
        )}
      </div>
      {showVersions && (
        <ul className="border-t border-slate-100 px-3 py-2 dark:border-slate-700">
          {slot.versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 py-1 text-xs text-slate-600 dark:text-slate-300">
              <span className={`rounded-md px-1.5 font-bold ${v.isCurrent ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100" : "bg-slate-100 dark:bg-slate-700"}`}>v{v.version}</span>
              <span className="flex-1 truncate">{v.name}</span>
              <span className="text-slate-400">{timeAgo(v.createdAt)}</span>
              <button type="button" className="text-brand-600 dark:text-brand-200" onClick={() => onPreview(v)} aria-label={`Preview v${v.version}`}><Eye className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="border-t border-slate-100 p-3 dark:border-slate-700">
          <Dropzone compact onFiles={upload} accept={ACCEPT[type]} busy={busy} progress={progress} error={error} label={cur ? "Replace" : "Add"} icon={cur ? RefreshCw : undefined} />
        </div>
      )}
    </motion.div>
  );
};

const DocumentsPanel: React.FC<{ p: ProjectDetail; onChanged: () => void }> = ({ p, onChanged }) => {
  const [preview, setPreview] = useState<DocVersion | null>(null);
  const filled = (["CONCEPT", "SRS", "IMPLEMENTATION_PLAN"] as DocType[]).filter((t) => p.documents[t].current).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2" aria-label={`${filled} of 3 documents`}>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: i * 0.1 }} className={`h-1.5 flex-1 origin-left rounded-full ${i < filled ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />
        ))}
        <span className="text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300">{filled}/3</span>
      </div>
      {(["CONCEPT", "SRS", "IMPLEMENTATION_PLAN"] as DocType[]).map((t) => (
        <Slot key={t} type={t} slot={p.documents[t]} canEdit={p.rights.edit} pending={t === "CONCEPT" && p.conceptPending} projectId={p.id} onChanged={onChanged} onPreview={setPreview} />
      ))}
      <Modal isOpen={!!preview} onClose={() => setPreview(null)} title={preview ? `${DOC_META[preview.type].label} · v${preview.version}` : ""} size="3xl" contentClassName="p-3">
        {preview ? <AssetPreview assetId={preview.assetId} name={preview.name} /> : <Spinner />}
      </Modal>
    </div>
  );
};

export default DocumentsPanel;
