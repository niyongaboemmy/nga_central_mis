import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { failure, sideProjectsApi, type Kind, type ProjectDetail } from "../../api/sideProjects";
import { useToast } from "../../contexts/ToastContext";
import { KIND_META, KINDS, KindChip, Spinner } from "./ui";

/**
 * The project's classification. Read-only chip for most people; a small menu for those who may
 * change it (SIDE_PROJECTS_CLASSIFY, never a student account, on a project they may edit).
 */
const KindControl: React.FC<{ p: ProjectDetail; canChange: boolean; onChanged: () => void }> = ({ p, canChange, onChanged }) => {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  if (!canChange) return <KindChip kind={p.kind} />;
  const M = KIND_META[p.kind] ?? KIND_META.INDIVIDUAL;

  const pick = async (k: Kind) => {
    setOpen(false);
    if (k === p.kind) return;
    setBusy(true);
    try {
      await sideProjectsApi.setKind(p.id, k);
      showToast(`Now a ${KIND_META[k].label.toLowerCase()}`, "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "The project type wasn't changed").message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Project type: ${M.label}. Change`}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        {busy ? <Spinner className="h-3 w-3" /> : <M.icon className="h-3 w-3" aria-hidden />}
        {M.short}
        <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Project type" className="absolute left-0 top-7 z-30 w-64 overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-white p-1.5 dark:border-white/10 dark:bg-gray-900">
          {KINDS.map((k) => {
            const K = KIND_META[k];
            const on = k === p.kind;
            return (
              <button
                key={k}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => pick(k)}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-700/50"
              >
                <K.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-gray-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-gray-100">{K.label}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-gray-400">{K.hint}</span>
                </span>
                {on && <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KindControl;
