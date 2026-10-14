import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronRight, CloudUpload, FileCode2, FileArchive, Folder, FolderOpen, FolderPlus, Home, Loader2, X } from "lucide-react";
import { documentApi, folderApi, type Document as SavedDocument, type Folder as DocFolder } from "../../api/documents";
import { useOptionalAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { baseName, extOf, type PlayFile } from "./project";
import { cleanFileName, fileBlob, mimeFor, numberedName, projectZip, withExtension } from "./saveCode";

/**
 * "Save to Documents": keeps the playground's code in the person's MIS Documents —
 * the open file, or the whole project as a .zip — in the folder they pick. Saving
 * again under the same name in the same place updates that document (what it held
 * stays in its history) unless they choose a copy.
 */
export interface SaveToDocumentsDialogProps {
  files: PlayFile[];
  /** The file open in the editor. */
  activePath: string;
  /** Name for the .zip of the whole project. */
  zipName: string;
  languageLabel: string;
  /** Playground language id, saved as a tag ("python", "html"…). */
  languageId: string;
  onClose: () => void;
  /** Called after a save (tests, analytics). */
  onSaved?: (doc: SavedDocument, how: "new" | "updated") => void;
}

type Tree = DocFolder & { children?: Tree[] };
type What = "file" | "project";
type Place = number | "root";

const PLACE_KEY = "codePlayground.saveFolder";
/** Where AcademicPeriodContext keeps the selected year (the lesson modal sits outside it). */
const YEAR_KEY = "academic_period_year_id";

const readPlace = (): Place => {
  try {
    const v = localStorage.getItem(PLACE_KEY);
    return v && /^\d+$/.test(v) ? Number(v) : "root";
  } catch {
    return "root";
  }
};
const rememberPlace = (p: Place) => {
  try {
    localStorage.setItem(PLACE_KEY, String(p));
  } catch {
    /* private mode */
  }
};
const storedYear = (): number | null => {
  try {
    const v = Number(localStorage.getItem(YEAR_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

const errorText = (e: unknown, fallback: string) => {
  const m = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof m === "string" && m.trim() ? m : fallback;
};

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

const SaveToDocumentsDialog: React.FC<SaveToDocumentsDialogProps> = ({ files, activePath, zipName, languageLabel, languageId, onClose, onSaved }) => {
  const period = useOptionalAcademicPeriod();
  const yearId = period?.selectedYearId ?? storedYear();
  const yearName = period?.selectedYear?.name ?? null;
  const uid = useId().replace(/:/g, "");
  const nameRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const multi = files.length > 1;
  const [what, setWhat] = useState<What>(multi ? "project" : "file");
  const active = files.find((f) => f.path === activePath) ?? files[0];
  const defaultName = what === "project" ? zipName : baseName(active.path);
  const [name, setName] = useState(defaultName);
  const ext = what === "project" ? "zip" : extOf(active.path);
  useEffect(() => setName(defaultName), [defaultName]);

  const [place, setPlace] = useState<Place>(readPlace);
  const [tree, setTree] = useState<Tree[] | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [treeError, setTreeError] = useState("");
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [description, setDescription] = useState(
    // The server HTML-escapes notes, so "&" would read "&amp;" in Documents.
    `${languageLabel.replace(/\s*&\s*/g, " and ")} code saved from the Code Playground`,
  );
  const [existing, setExisting] = useState<SavedDocument | null>(null);
  const [checking, setChecking] = useState(false);
  const [mode, setMode] = useState<"update" | "copy">("update");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ doc: SavedDocument; how: "new" | "updated"; where: string } | null>(null);

  const finalName = withExtension(name || defaultName, ext);

  // The person's folders (root folders of the selected year, with their sub-folders).
  const loadTree = async () => {
    try {
      const r = await folderApi.getTree(yearId ?? undefined);
      const t = (r.data?.data ?? []) as Tree[];
      setTree(t);
      setTreeError("");
      return t;
    } catch (e) {
      setTree([]);
      setTreeError(errorText(e, "Your folders couldn't be loaded. You can still save to My Documents."));
      return [];
    }
  };
  useEffect(() => {
    void loadTree().then((t) => {
      // The folder used last time, if it's still there (and open the way to it).
      const want = readPlace();
      const trail = want === "root" ? null : pathTo(t, want);
      if (want !== "root" && !trail) setPlace("root");
      if (trail) setOpen(new Set(trail.slice(0, -1).map((f) => f.folder_id)));
    });
    nameRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pathTo = (t: Tree[], id: number): Tree[] | null => {
    for (const f of t) {
      if (f.folder_id === id) return [f];
      const sub = f.children ? pathTo(f.children, id) : null;
      if (sub) return [f, ...sub];
    }
    return null;
  };
  const trail = useMemo(() => (place === "root" || !tree ? [] : pathTo(tree, place) ?? []), [place, tree]);
  const where = ["My Documents", ...trail.map((f) => f.name)].join(" › ");

  /** The document called `n` here, if there is one. */
  const lookup = async (n: string): Promise<SavedDocument | null> => {
    const r = await documentApi.findByName(place === "root" ? { name: n, ...(yearId ? { academicYearId: yearId } : {}) } : { name: n, folderId: place });
    return r.data?.data ?? null;
  };
  /** What `existing` was looked up for (name + place); Save looks again if it's stale. */
  const checkKey = `${finalName}|${place}|${yearId ?? ""}`;
  const [checkedKey, setCheckedKey] = useState("");

  // Is there already a document with this name here? (debounced)
  useEffect(() => {
    if (saved) return;
    setExisting(null);
    setCheckedKey("");
    if (!finalName) return;
    setChecking(true);
    let live = true;
    const t = window.setTimeout(async () => {
      try {
        const found = await lookup(finalName);
        if (!live) return;
        setExisting(found);
        setMode("update");
        setCheckedKey(checkKey);
      } catch {
        if (live) setExisting(null);
      } finally {
        if (live) setChecking(false);
      }
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalName, place, yearId, saved]);

  // Esc closes this dialog only (not the playground behind it); Tab stays inside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!saving) onClose();
      } else if (e.key === "Tab" && boxRef.current) {
        const els = [...boxRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, a[href], [tabindex="0"]')];
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, saving]);

  const createFolder = async () => {
    const n = cleanFileName(newFolder ?? "");
    if (!n) return;
    setCreating(true);
    setError("");
    try {
      const r = await folderApi.create({ name: n, ...(place === "root" ? (yearId ? { academicYearId: yearId } : {}) : { parentFolderId: place }) });
      const created = r.data?.data as DocFolder | undefined;
      await loadTree();
      if (created?.folder_id) {
        if (place !== "root") setOpen((o) => new Set(o).add(place));
        setPlace(created.folder_id);
      }
      setNewFolder(null);
    } catch (e) {
      setError(errorText(e, "The folder couldn't be created."));
    } finally {
      setCreating(false);
    }
  };

  /** A name not taken yet in this place: "main (2).py", "main (3).py"… */
  const freeName = async (n: string) => {
    for (let i = 2; i < 50; i++) {
      const candidate = numberedName(n, i);
      if (!(await lookup(candidate))) return candidate;
    }
    return numberedName(n, Date.now() % 100000);
  };

  const save = async () => {
    if (saving || !finalName) return;
    setSaving(true);
    setError("");
    try {
      // Saved right after typing: the name check may not have run yet. Run it now, and if the
      // name is taken, show the choice (update or copy) instead of guessing.
      let ex: SavedDocument | null = existing;
      if (checkedKey !== checkKey) {
        ex = await lookup(finalName);
        setExisting(ex);
        setMode("update");
        setCheckedKey(checkKey);
        setChecking(false);
        if (ex) return;
      }
      const blob = what === "project" ? await projectZip(files) : fileBlob(active);
      const update = !!ex && mode === "update";
      const fileName = ex && update ? ex.original_name : ex ? await freeName(finalName) : finalName;
      const file = new File([blob], fileName, { type: what === "project" ? "application/zip" : mimeFor(active.path) });
      const form = new FormData();
      form.append("file", file);
      let doc: SavedDocument;
      if (update) {
        form.append("changeDescription", description.trim() || "Saved from the Code Playground");
        doc = (await documentApi.replaceContent(ex!.document_id, form)).data.data;
      } else {
        if (place === "root") {
          if (yearId) form.append("academicYearId", String(yearId));
        } else form.append("folderId", String(place));
        if (description.trim()) form.append("description", description.trim());
        form.append("tags", ["code-playground", languageId].join(","));
        doc = (await documentApi.upload(form)).data.data;
      }
      rememberPlace(place);
      setSaved({ doc, how: update ? "updated" : "new", where });
      onSaved?.(doc, update ? "updated" : "new");
    } catch (e) {
      setError(errorText(e, "Saving failed. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  const renderTree = (items: Tree[], depth: number): React.ReactNode =>
    items.map((f) => {
      const kids = f.children ?? [];
      const isOpen = open.has(f.folder_id);
      const selected = place === f.folder_id;
      return (
        <li key={f.folder_id} role="treeitem" aria-selected={selected} aria-expanded={kids.length ? isOpen : undefined}>
          <div className={`flex items-center gap-1 rounded-lg pr-2 ${selected ? "bg-brand-50 dark:bg-brand-500/15" : "hover:bg-slate-50 dark:hover:bg-white/5"}`} style={{ paddingLeft: 4 + depth * 16 }}>
            <button
              type="button"
              tabIndex={-1}
              aria-label={isOpen ? `Close ${f.name}` : `Open ${f.name}`}
              onClick={() => setOpen((o) => (o.has(f.folder_id) ? new Set([...o].filter((x) => x !== f.folder_id)) : new Set(o).add(f.folder_id)))}
              className={`h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 ${kids.length ? "hover:text-slate-700 dark:hover:text-slate-200" : "invisible"}`}
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setPlace(f.folder_id)}
              className={`flex-1 min-w-0 flex items-center gap-2 h-8 text-left text-[13px] ${selected ? "font-semibold text-brand-700 dark:text-brand-200" : "text-slate-700 dark:text-slate-200"}`}
              data-testid="save-docs-folder"
              data-folder={f.folder_id}
            >
              {selected ? <FolderOpen className="w-4 h-4 shrink-0" style={{ color: f.color || undefined }} /> : <Folder className="w-4 h-4 shrink-0" style={{ color: f.color || undefined }} />}
              <span className="truncate">{f.name}</span>
            </button>
            {selected && <Check className="w-4 h-4 text-brand-600 dark:text-brand-200 shrink-0" />}
          </div>
          {kids.length > 0 && isOpen && <ul role="group">{renderTree(kids, depth + 1)}</ul>}
        </li>
      );
    });

  const optionCls = (on: boolean) =>
    `flex-1 min-w-0 flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
      on ? "border-brand-500 bg-brand-50/70 dark:bg-brand-500/10 ring-1 ring-brand-500/30" : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
    }`;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] sm:p-4 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-white dark:bg-[#161b22] text-slate-800 dark:text-slate-100 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
        data-testid="save-docs-dialog"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/10">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-200">
            <CloudUpload className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id={`${uid}-title`} className="text-base font-semibold">
              Save to Documents
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Keep your code in your MIS documents to open it again later.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {saved ? (
          <div className="px-5 py-6 text-center" data-testid="save-docs-done" role="status">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success-100 dark:bg-green-500/15 text-success-700 dark:text-green-300">
              <Check className="w-6 h-6" />
            </span>
            <p className="mt-3 font-semibold">{saved.how === "updated" ? "Updated in Documents" : "Saved to Documents"}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 break-words">
              {saved.where} › <span className="font-medium">{saved.doc.original_name}</span>
            </p>
            {saved.how === "updated" && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The copy it had before is kept in the file's history.</p>}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a
                // A new tab: the lesson (or playground) stays open here. Plain <a>, not <Link>:
                // the lesson's playground modal is outside the router.
                href="/documents"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 dark:border-white/15 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5">
                <FolderOpen className="w-4 h-4" /> Open Documents
              </a>
              <button type="button" onClick={onClose} autoFocus className="h-9 px-5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {multi && (
              <fieldset>
                <legend className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">What to save</legend>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button type="button" aria-pressed={what === "project"} onClick={() => setWhat("project")} className={optionCls(what === "project")} data-testid="save-docs-project">
                    <FileArchive className="w-5 h-5 mt-0.5 text-brand-600 dark:text-brand-200 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Whole project</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">.zip with all {files.length} files</span>
                    </span>
                  </button>
                  <button type="button" aria-pressed={what === "file"} onClick={() => setWhat("file")} className={optionCls(what === "file")} data-testid="save-docs-file">
                    <FileCode2 className="w-5 h-5 mt-0.5 text-brand-600 dark:text-brand-200 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">This file</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{active.path}</span>
                    </span>
                  </button>
                </div>
              </fieldset>
            )}

            <div>
              <label htmlFor={`${uid}-name`} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                File name
              </label>
              <input
                id={`${uid}-name`}
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                spellCheck={false}
                autoComplete="off"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] text-sm font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                data-testid="save-docs-name"
              />
              {finalName !== cleanFileName(name) && name.trim() && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Saved as <span className="font-mono">{finalName}</span>
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span id={`${uid}-where`} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Save in
                </span>
                {newFolder === null && (
                  <button type="button" onClick={() => setNewFolder("")} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-200 hover:underline" data-testid="save-docs-new-folder">
                    <FolderPlus className="w-3.5 h-3.5" /> New folder
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/10 max-h-56 overflow-y-auto p-1.5">
                <ul role="tree" aria-labelledby={`${uid}-where`}>
                  <li role="treeitem" aria-selected={place === "root"}>
                    <button
                      type="button"
                      onClick={() => setPlace("root")}
                      className={`w-full flex items-center gap-2 h-8 px-2 rounded-lg text-left text-[13px] ${place === "root" ? "bg-brand-50 dark:bg-brand-500/15 font-semibold text-brand-700 dark:text-brand-200" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}
                      data-testid="save-docs-root"
                    >
                      <Home className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate">My Documents{yearName ? <span className="font-normal text-slate-500 dark:text-slate-400"> · {yearName}</span> : null}</span>
                      {place === "root" && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  </li>
                  {tree === null ? (
                    <li className="flex items-center gap-2 px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your folders…
                    </li>
                  ) : (
                    renderTree(tree, 0)
                  )}
                </ul>
                {newFolder !== null && (
                  <div className="flex items-center gap-2 mt-1.5 p-1.5 rounded-lg bg-slate-50 dark:bg-white/5">
                    <FolderPlus className="w-4 h-4 text-slate-500 shrink-0" />
                    <input
                      value={newFolder}
                      onChange={(e) => setNewFolder(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void createFolder();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          e.nativeEvent.stopImmediatePropagation();
                          setNewFolder(null);
                        }
                      }}
                      autoFocus
                      placeholder={`New folder in ${trail.length ? trail[trail.length - 1].name : "My Documents"}`}
                      aria-label="New folder name"
                      maxLength={100}
                      className="flex-1 min-w-0 h-8 px-2 rounded-md border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0d1117] text-sm outline-none focus:border-brand-500"
                      data-testid="save-docs-folder-name"
                    />
                    <button type="button" onClick={() => void createFolder()} disabled={creating || !newFolder.trim()} className="h-8 px-3 rounded-md bg-brand-600 text-white text-xs font-semibold disabled:opacity-50" data-testid="save-docs-create-folder">
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create"}
                    </button>
                    <button type="button" onClick={() => setNewFolder(null)} aria-label="Cancel new folder" className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {treeError && <p className="mt-1 text-xs text-warning-700 dark:text-amber-300">{treeError}</p>}
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate" data-testid="save-docs-where">
                {where} › <span className="font-mono">{finalName}</span>
              </p>
            </div>

            {(existing || checking) && (
              <div className={`rounded-xl border p-3 ${existing ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10" : "border-transparent"}`} aria-live="polite">
                {checking && !existing ? (
                  <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking this folder…
                  </p>
                ) : existing ? (
                  <div data-testid="save-docs-existing">
                    <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>
                        <span className="font-semibold">{existing.original_name}</span> is already here (saved {ago(existing.updated_at || existing.created_at)}).
                      </span>
                    </p>
                    <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label="When the name is taken">
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="radio" name={`${uid}-mode`} checked={mode === "update"} onChange={() => setMode("update")} className="mt-1 accent-brand-600" data-testid="save-docs-update" />
                        <span>
                          Update it <span className="text-xs text-slate-600 dark:text-slate-300">— the copy it has now is kept in its history</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="radio" name={`${uid}-mode`} checked={mode === "copy"} onChange={() => setMode("copy")} className="mt-1 accent-brand-600" data-testid="save-docs-copy" />
                        <span>
                          Save a new copy <span className="text-xs text-slate-600 dark:text-slate-300">— as {numberedName(finalName, 2)} or the next free name</span>
                        </span>
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <label htmlFor={`${uid}-desc`} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Note <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
              </label>
              <textarea
                id={`${uid}-desc`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 resize-none"
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-danger-100/70 dark:bg-red-500/10 px-3 py-2 text-sm text-danger-700 dark:text-red-300" role="alert" data-testid="save-docs-error">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={saving} className="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !finalName}
                className="inline-flex items-center gap-2 h-9 px-5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-60"
                data-testid="save-docs-submit"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                {saving ? "Saving…" : existing && mode === "update" ? "Update" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SaveToDocumentsDialog;
