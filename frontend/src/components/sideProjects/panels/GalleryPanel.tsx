import React, { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, FileArchive, FileCode, FileSpreadsheet, FileText, Presentation, Star, Trash2, X, Pencil, Check, Music } from "lucide-react";
import { failure, fileUrl, sideProjectsApi, type Media, type ProjectDetail } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import Modal from "../../ui/Modal";
import { AssetPreview } from "./DocumentsPanel";
import { Dropzone, EmptyArt, fmtBytes, inputCls } from "../ui";

const KIND_ICON: Record<string, React.ElementType> = { pdf: FileText, word: FileText, slides: Presentation, sheet: FileSpreadsheet, csv: FileSpreadsheet, code: FileCode, markdown: FileText, text: FileText, archive: FileArchive, audio: Music };
const ACCEPT = "image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.zip,.md,.txt,.json,.py,.js,.ts,.html,.css,.sql,.mp3,.m4a,.wav";

const Tile: React.FC<{ m: Media; cover: boolean; canEdit: boolean; onOpen: () => void; onCover: () => void; onDelete: () => void }> = ({ m, cover, canEdit, onOpen, onCover, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id, disabled: !canEdit });
  const Icon = KIND_ICON[m.kind] ?? FileText;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group relative aspect-square overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-slate-50 dark:border-white/[0.06] dark:bg-gray-800/40 ${isDragging ? "z-10 opacity-60 " : ""}`} {...attributes} {...listeners}>
      <button type="button" onClick={onOpen} className="absolute inset-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40" aria-label={`Open ${m.caption || m.name}`}>
        {m.kind === "image" ? (
          <img src={fileUrl(m.assetId, m.hasThumb ? "thumb" : "original")} alt={m.caption ?? ""} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-2">
            <Icon className="h-10 w-10 text-blue-500" aria-hidden />
            <span className="line-clamp-2 text-center text-[11px] font-semibold text-slate-600 dark:text-gray-300">{m.name}</span>
            <span className="text-[10px] text-slate-400">{fmtBytes(m.size)}</span>
          </div>
        )}
      </button>
      {m.caption && m.kind === "image" && <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-[11px] font-medium text-white">{m.caption}</span>}
      {cover && <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-400 p-1 text-white " title="Cover"><Star className="h-3 w-3 fill-current" /></span>}
      {canEdit && (
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100" onPointerDown={(e) => e.stopPropagation()}>
          {m.kind === "image" && !cover && (
            <button type="button" onClick={onCover} aria-label="Make cover" className="rounded-full bg-white/90 p-1.5 text-amber-500 hover:bg-white dark:bg-gray-900/90"><Star className="h-3.5 w-3.5" /></button>
          )}
          <button type="button" onClick={onDelete} aria-label="Delete" className="rounded-full bg-white/90 p-1.5 text-red-600 hover:bg-white dark:bg-gray-900/90"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
};

const GalleryPanel: React.FC<{ p: ProjectDetail; onChanged: () => void }> = ({ p, onChanged }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Media[]>(p.media);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  useEffect(() => setItems(p.media), [p.media]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const upload = async (files: File[]) => {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      await sideProjectsApi.uploadMedia(p.id, files, setProgress);
      showToast(`${files.length} added`, "success");
      onChanged();
    } catch (e) {
      setError(failure(e).message);
    } finally {
      setBusy(false);
    }
  };
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((x) => x.id === e.active.id);
    const to = items.findIndex((x) => x.id === e.over!.id);
    const next = arrayMove(items, from, to);
    setItems(next);
    try {
      await sideProjectsApi.orderMedia(p.id, next.map((x) => x.id));
    } catch (err) {
      setItems(items);
      showToast(failure(err).message, "error");
    }
  };
  const current = open !== null ? items[open] : null;

  return (
    <div className="space-y-3">
      {p.rights.edit && <Dropzone multiple onFiles={upload} accept={ACCEPT} busy={busy} progress={progress} error={error} label="Drop screenshots, diagrams, files" hint="Images · PDF · slides · zip — up to 10 at once" />}
      {items.length === 0 ? (
        !p.rights.edit && <EmptyArt className="my-6" />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((m) => m.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((m, i) => (
                <Tile
                  key={m.id}
                  m={m}
                  cover={p.coverAssetId === m.assetId}
                  canEdit={p.rights.edit}
                  onOpen={() => setOpen(i)}
                  onCover={async () => {
                    await sideProjectsApi.updateMedia(p.id, m.id, { cover: true }).catch((e) => showToast(failure(e).message, "error"));
                    onChanged();
                  }}
                  onDelete={async () => {
                    if (!(await confirm({ title: "Delete this file?", tone: "danger", confirmText: "Delete" }))) return;
                    await sideProjectsApi.removeMedia(p.id, m.id).catch((e) => showToast(failure(e).message, "error"));
                    onChanged();
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Lightbox for images; documents open in the previewer. */}
      <AnimatePresence>
        {current && current.kind === "image" && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label="Image viewer"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(null);
              if (e.key === "ArrowRight") setOpen((o) => (o === null ? o : (o + 1) % items.length));
              if (e.key === "ArrowLeft") setOpen((o) => (o === null ? o : (o - 1 + items.length) % items.length));
            }}
            tabIndex={-1}
            ref={(el) => el?.focus()}
          >
            <motion.img key={current.id} src={fileUrl(current.assetId)} alt={current.caption ?? ""} initial={{ scale: 0.92 }} animate={{ scale: 1 }} className="max-h-[80vh] max-w-full rounded-xl object-contain " onClick={(e) => e.stopPropagation()} />
            <div className="absolute bottom-6 left-1/2 flex w-[min(36rem,90vw)] -translate-x-1/2 items-center gap-2 rounded-2xl bg-white/10 p-2 text-white backdrop-blur" onClick={(e) => e.stopPropagation()}>
              {caption !== null ? (
                <>
                  <input autoFocus value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} className={`${inputCls} flex-1 !bg-white/90 !text-slate-800`} aria-label="Caption" />
                  <button type="button" aria-label="Save caption" className="rounded-full bg-emerald-500 p-2" onClick={async () => {
                    await sideProjectsApi.updateMedia(p.id, current.id, { caption }).catch((e) => showToast(failure(e).message, "error"));
                    setCaption(null);
                    onChanged();
                  }}><Check className="h-4 w-4" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate px-2 text-sm">{current.caption || current.name}</span>
                  {p.rights.edit && <button type="button" aria-label="Edit caption" className="rounded-full p-2 hover:bg-white/10" onClick={() => setCaption(current.caption ?? "")}><Pencil className="h-4 w-4" /></button>}
                  <a href={fileUrl(current.assetId, "original", true)} aria-label="Download" className="rounded-full p-2 hover:bg-white/10"><Download className="h-4 w-4" /></a>
                </>
              )}
            </div>
            {items.length > 1 && (
              <>
                <button type="button" aria-label="Previous" className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), setOpen((o) => (o === null ? o : (o - 1 + items.length) % items.length)))}><ChevronLeft className="h-6 w-6" /></button>
                <button type="button" aria-label="Next" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), setOpen((o) => (o === null ? o : (o + 1) % items.length)))}><ChevronRight className="h-6 w-6" /></button>
              </>
            )}
            <button type="button" aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setOpen(null)}><X className="h-5 w-5" /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <Modal isOpen={!!current && current.kind !== "image"} onClose={() => setOpen(null)} title={current?.name ?? ""} size="3xl" contentClassName="p-3">
        {current && current.kind !== "image" && <AssetPreview assetId={current.assetId} name={current.name} />}
      </Modal>
    </div>
  );
};

export default GalleryPanel;
